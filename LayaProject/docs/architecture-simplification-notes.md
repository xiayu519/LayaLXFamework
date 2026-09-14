# Tyou 对比与单一入口改造

当前框架按单人开发、单人维护定位。AppEntry 先显示固定 Loading，再调用 lx.init；lx 本身持有模块，初始化顺序集中在 lx.ts。业务 World 和原生异步清理规则保留。

## 对比结论

本地对照源码位于 D:/gitframework/Tyou/Client/assets/ty-framework/Tyou.ts。Tyou 直接声明模块成员，在 onLoad/onCreate 中组织创建和启动；Main 直接调用 tyou。它的 Cocos 节点和 Update 实现不移植到 Laya。

之前用“模块实例没有重复”证明结构不冗余，判断不充分。同一批模块仍可能被重复的访问门面、运行时持有者、绑定 Host 和接口清单包围，增加单人开发的阅读与修改成本。本轮采用直接持有模块的结构。

| 核查点 | 结论与处理 |
| --- | --- |
| 模块实例 | 原来没有创建两份模块；但分层仍有冗余，不能用实例数量否定使用成本 |
| 根入口 | lx 直接持有模块；移除 FrameworkRuntime、LxFacade、lxRuntimeHost |
| 启动工厂 | createApplication 原本是导出别名；实际工厂链和旧类型出口已移除，AppEntry 直接调用 lx.init |
| 模块类型清单 | 移除 RuntimeContext/ApplicationRuntime；需要少量类型时使用具体对象或 typeof lx 的子集 |
| 单行生命周期包装 | 移除 WorldsService、ClientPreferencesService、ExampleAccountService；动作集中在根初始化/停止顺序中 |
| 示例同步/导航包装 | 移除 ExampleInitialSynchronization、ExampleWorldFlow；示例配置自己同步，并在 register 中集中登记 World 工厂 |
| 配置校验包装 | 移除误导性的 GameReadyService，配置加载归游戏 initialize；完整同步才决定根 Ready |
| 真实异步责任 | AppBootstrap 仍在内部处理取消、超时和逆序补偿；ResourceCleanup 仍处理原始加载、原生延迟销毁和 GC |
| 引擎方式 | EventDispatcher、Laya.timer、Loader、Scene、ui2 继续使用 Laya 原生能力，无全局自制 Update 或新 Timer |

不能因为 Tyou 的入口更短，就推导其所有模块更优。其 UI 也包含取消、加载合并和 ownerEpoch；本项目保留对应的实际失败边界。本轮没有进行跨框架性能比较。

## 开发者需要看的代码

1. [AppEntry.ts](../src/AppEntry.ts)：打开固定 StartupScene，调用 lx.init，成功关闭 Loading，失败展示并清理。
2. [lx.ts](../src/framework/lx.ts)：模块成员、全部框架模块创建、启动顺序、停止入口。
3. [GameStartup.ts](../src/game/bootstrap/GameStartup.ts)：当前项目选择哪份游戏配置和启动画面。
4. [GameApplication.ts](../src/game/logic/bootstrap/GameApplication.ts)：可调用演示配置，register 集中登记公共 UI 与 World 工厂，initialize 处理全局演示数据与红点，dispose 清理；局部事件留在对应 World。
5. [LobbyWorld.ts](../src/game/logic/bootstrap/worlds/LobbyWorld.ts)、[BattleWorld.ts](../src/game/logic/bootstrap/worlds/BattleWorld.ts)：onRegister 分别调用 registerEvents、registerUI、registerScenes，事件处理方法留在本类；退出时自动撤销订阅与注册，onExit 清理本类引用。

```text
main → AppEntry.start
       → StartupScene.openStartup
       → lx.init(GameApplication)
          → 创建并启动框架模块
          → register / initialize 全局游戏内容
          → await synchronization.synchronize
          → 根 ready → initialWorld
       → 销毁 Startup
```

lx 对象在模块加载时存在，原生模块在 init 中创建。ready 只表示全局初始化和配置的同步任务完成；init/main 继续等待首次 World。正常停止后仍使用同一个 lx 对象，新一轮初始化创建新的模块。未完成的清理不能被新的初始化覆盖；没有绑定 Host、隔离 Runtime 集合或后台轮询。

## 示例与实际游戏

src/game/logic 是保留的可调用脚本库。当前 GameStartup 选择其中的演示配置，所以默认运行仍会展示背包、大厅和战斗示例；模拟来源明确标记为 development-simulator。这些模型不会移入 framework，也不改名冒充正式账号或服务器。

实际 IAP 游戏替换 GameStartup 选择的配置：在 initialize 安装账号数据接收与红点规则，在 synchronization 中等待真实服务器完整首包和权益/红点状态。仅连上 Socket 或写一个直接成功的 TODO 都不能代表数据已同步。当前真实服务器、重连策略和 IAP 权益接入尚未实现。

## 保留的归属规则

- 根持有全局数据、红点、公共事件、lx.http 和 lx.net。lx.net 直接提供原生 Socket 方法；内部 NetworkService 仅处理其启停。关闭某个业务 World 不重置账号或断开根连接。
- READY/STOPPING 及框架自身监听在 lx.ts 登记；大厅/战斗导航请求在各自的 world.events 登记，不广播到根，也不汇总到 GameApplication。
- WorldScope 有真实的本地事件、订阅和清理状态，负责小 World 的存活期；它不是根访问转发层。
- World 工厂注册不创建实例；每次进入才创建新的 World 和局部事件源。
- Scene/UI 的 owner 和宿主保持原生约定，关闭时解除自己的监听和 timer/Tween。
- 旧异步任务在退出后失效，原始加载和晚到补偿仍被等待；稳定后才能执行 Scene.gc。
- 上游/下游同步限制保持原样；本轮没有改 lock、manifest 或同步强制限制。

## 验证

相关回归见 [根初始化测试](../tests/game/logic/ApplicationComposition.test.ts)、[入口测试](../tests/framework/AppEntry.test.ts)、[生命周期执行器测试](../tests/framework/AppBootstrap.test.ts) 和 [启动/World 原生探针](../tests/game/logic/startup-worlds.browser.mjs)。

真实引擎探针覆盖 Loading 先显示、数据同步前不进 Lobby、失败重试、World 并存与关闭、公共/局部事件隔离、局部倍速，以及原生 WebSocket 文本/二进制回声和根停止。实际命令与本机结果见 [验证记录](world-lifecycle-design.md#2026-09-14-验证记录)，不将 Windows Chromium 的通过外推到其他平台。

代码规范见 [code-style.md](code-style.md)，World 契约见 [world-lifecycle-design.md](world-lifecycle-design.md)。
