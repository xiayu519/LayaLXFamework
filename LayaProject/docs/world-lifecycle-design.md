# 框架 World 与业务 World 的通用生命周期设计

日期：2026-09-14。状态：第一版已实施；真实服务器连接、完整同步协议和 IAP 权益接入仍为 TODO。

补充的逐帧更新、BattleWorld 局部倍速和 WebSocket 集成见 [World 时间与网络](world-time-and-network.md)。lx.http 负责 HTTP，lx.net 为根持有的原生 Socket，默认不连接。

## 已明确的需求

AppEntry 先直接打开固定 StartupScene，再调用 lx.init。全部框架模块在 lx.ts 集中创建和初始化。World 是普通 TS 对象，不挂载节点；逐帧任务按需使用 Laya.timer，不建全局 Update。

Laya 初始化已创建并驱动公开的 timer 与 loader，本设计复用这些实例。[Laya 3.4.1 初始化源码](https://github.com/layabox/LayaAir/blob/v3.4.1/src/layaAir/Laya.ts)

框架自身是长期存在的大 World，主管框架与应用级功能。业务是小 World，每个小 World 拥有自己的模块、UI 注册、事件订阅、Scene 与资源持有关系，随进入初始化，随关闭销毁。大 World 在框架停止时才销毁，并负责先关闭仍存活的小 World。

数据系统和红点系统是明确的全局内容：由大 World 初始化、持有与更新，小 World 只管理对应 UI 的显示和订阅。当前目标是 IAP 游戏；首次进入 LobbyWorld 必须等待全局数据同步完成，其中包括红点状态。真实网络接入留作 TODO。

所有权和回收规则保留；外部结构收敛为一个 lx 根对象和一个初始化入口。Tyou 的直接模块组织作为参考，底层仍遵循 Laya 原生 API。

## 生命周期树

```text
lx（唯一框架根，与框架生命周期一致）
├─ 公共 EventDispatcher、公共 UI 定义与应用窗口
├─ 平台、配表、全局功能和共享资源
├─ 全局数据系统、协议接收与账号状态（按登录状态重置）
├─ 全局红点系统、红点状态与计算规则
├─ 网络连接与首次数据同步协调（真实接入 TODO）
├─ LobbyWorld（每次进入建立独立运行期）
│  ├─ 局部 EventDispatcher、对公共事件源的订阅
│  ├─ 专属 UI/Scene 定义、业务模块、资源持有
│  └─ LobbyScene → 原生 uiRoot → UI/子窗口
└─ BattleWorld（每次进入建立独立运行期）
   ├─ 局部 EventDispatcher、对公共事件源的订阅
   ├─ 专属 UI/Scene 定义、业务模块、资源持有
   └─ BattleScene → 原生 uiRoot → UI/子窗口
```

lx 本身就是根 World：模块访问与模块所有权在同一对象。业务 World 的注册和初始化由 ApplicationConfig 提供，framework 不依赖 game，也不创建平行 Runtime。

父级拥有子级的存活责任；SceneRegistry/UIRouter 可以继续实际保存实例。管理器保存对象与 World 拥有其生命周期并不冲突：关键是每个注册和实例都能追溯到本次 World 运行期。

关闭 LobbyWorld 不影响 BattleWorld、根事件源、公共 UI 定义或账号数据。账号退出清理账号内容，也不等于销毁框架。进程直接被操作系统终止时不能保证执行异步清理，存档不能只依赖最终退出钩子。

## IAP 游戏的根 World 启动与就绪条件

沿用现有启动入口，将根初始化与进入业务 World 的边界明确为：

```text
Laya 引擎初始化完成 → AppEntry 显示 Startup
  → 大 World 初始化原生适配、公共事件、公共 UI 与全局服务
  → 初始化全局数据模型、红点存储及规则，先安装数据接收入口
  → TODO：连接服务器、建立账号会话、请求首次同步
  → 接收并校验同步数据，写入全局模型与服务端红点状态
  → 完成本次数据对应的本地红点计算，确认首次同步完整
  → 大 World Ready（所有必需全局服务与数据已就绪）
  → 初始化 LobbyWorld → 打开 LobbyScene/UI
  → 大厅首次展示读取已有数据/红点 → 销毁 Startup
```

Ready 是根生命周期协调者等待初始化任务得到的状态，不能由任意 UI 或一条事件广播设置。模型、红点规则和接收入口必须先于连接建立，避免首包到达时没有消费者。连接成功、登录成功、收到任意一条数据、构造了空模型，均不能单独代表全局数据就绪。

全局初始化任务由应用组合登记所需模块与可等待的首次同步步骤；框架等待这些任务，不硬编码背包、商城、任务等数据表名或 Lobby 的具体类。根 Ready 后再由现有游戏入口选择并进入初始 World，World 管理器负责阻止依赖根数据的小 World 提前进入。

lx.init 等待配置的 initialize 与 synchronization.synchronize 完成后，将根置为 ready，再进入 initialWorld。WorldRegistry 拒绝提前进入；init/main 继续等待首次 World 完成。AppEntry 的并发调用优先等待当前启动任务，Loading 在 Lobby UI 就绪后关闭。

数据系统和红点系统的对象在根初始化时建立一次；小 World 退出不清空它们，也不停止规则更新。红点规则属于全局功能模块，由游戏应用在根组合处登记；规则的业务代码仍在 game，框架不依赖具体游戏。UI 仅绑定和显示，根数据还未完成同步时不先打开空大厅再补一次初始化。

服务端直接下发的红点状态先写入对应全局状态；由本地数据推导的红点，在相关初始模型应用完毕后计算。每个红点 key 明确唯一来源或聚合规则，避免服务端状态与本地推导重复计数。Ready 等待模型与红点的初始状态一致；UI 的 callLater 渲染无需提前发生，首次展示会读取已就绪快照。

首次初始化失败、超时或取消时保持未就绪，Startup 显示失败，不进入 Lobby。当前完整启动失败会回滚根；main() 的再次启动通过同一个 lx 重新初始化模块，旧模型与规则监听已清理。运行期间的账号切换、断线重连与局部同步重试尚待协议接入实现，不能据此声称已完成在线游戏会话管理。旧账号 receiver 已有代次和版本保护；后续增量同步由根处理。

### 网络与同步 TODO

- 已集成根持有的 Laya.Socket；TODO：配置实际服务器、认证与消息契约，不预先实现未知协议的心跳/重连/消息路由。
- TODO：定义服务器首次同步完整的确认条件、必需数据集合、版本和重连补同步规则；以同步完成任务作为根 Ready 的一个必要条件。
- TODO：接入全局数据模型和红点状态应用，覆盖半包、乱序、旧账号、断线与重试失败。
- TODO：接入 IAP 结果影响的账号数据/权益同步；购买、确认和补发流程另按支付任务实现，本轮不伪造服务端发货结果。

当前 ExampleDeliveryService 的本地模拟可继续提供明确标记的开发数据来源；它只能证明示例初始化顺序，不能标记为真实服务器已连接或真实同步完成。正式连接尚未接入时不得用直接返回成功的空 TODO 绕过 Ready 条件。

## 两级事件源，订阅按 owner 清理

公共入口 `lx.events` 是根 World 持有的一个原生 `Laya.EventDispatcher`。每个业务 WorldScope 也拥有自己的原生 events；局部事件不自动冒泡。跨 World 通知通过明确的公共事件表达，业务 World 不互相读取对方内部对象。

原生 `on/once/event/off/offAllCaller` 已提供注册、派发和移除能力；EventDispatcher 可直接创建，无需 Node。`offAllCaller(caller)` 只移除当前派发器上的指定 caller，不会扫描全部事件源，也不等于对象销毁。[Laya 3.4 EventDispatcher API](https://layaair.layabox.com/3.x/api/3.4/classes/laya_events_EventDispatcher.EventDispatcher.html)

| 对象 | 事件源归谁 | 订阅归谁 | 结束时做什么 |
| --- | --- | --- | --- |
| 框架模块监听公共事件 | 根 World | 根模块运行期 | 根模块停止时解绑 |
| BattleWorld 监听公共事件 | 根 World | BattleWorld 本次运行期 | 只解绑 BattleWorld 的监听 |
| 战斗模块监听局部事件 | BattleWorld | 对应模块运行期 | 模块结束解绑；World 结束清理局部事件源 |
| UI 监听任意长期事件源 | 根或业务 World | UI 当前展示 | 关闭/隐藏结束展示时解绑，不能一直留到 World 退出 |

业务关闭不能对 `lx.events` 调用 `offAll()`。根停止时先关闭子 World，清理公共模块自己的订阅，最后对根自己独占的事件源清空监听并释放引用。Laya.stage、Loader、平台对象等外部事件源同样只解除自己登记的监听。

原生机制不会把一次 `lx.events.on(...)` 自动登记到 World。WorldScope.listen(source, type, caller, method) 调用原生 on 并保存精确 off；返回的解绑函数可提前调用并移除登记。本版不增加 once/emit API；直接使用原生 once 时，通过 own 登记精确 off。根模块在自身停止方法中按 caller 解绑，不建立另一套派发队列。

框架公共事件常量从 `framework/lx` 导入，定义见 [FrameworkEvent](../src/framework/bootstrap/FrameworkEvent.ts)。它们通过现有原生 `lx.events` 派发，不新增事件管理器。

| 常量 | 派发时机 | 参数 |
| --- | --- | --- |
| `FrameworkEvent.READY` | 全局模块、首次数据与红点同步完成，自动进入初始 World 之前；每轮初始化一次 | 无 |
| `FrameworkEvent.STOPPING` | 根开始关闭，在子 World 失效和模块清理之前；每轮关闭一次 | 无 |

公共事件只表达根框架的生命周期；子 World 的注册阶段由父类统一调用 `onRegister/registerEvents/registerUI/registerScenes`，进入和退出通过 `onEnter/onExit` 管理，局部业务事件使用各自的 `world.events`。当前不把每次子 World 进出广播到公共事件源。事件只作通知，不等待异步监听器；等待关闭完成使用 `await lx.stop()`，等待子 World 进入或退出使用 `await lx.worlds.enter/exit`。`STOPPING` 不代表已清理完成，不能替代生命周期清理。

[lx.ts](../src/framework/lx.ts) 创建公共事件源、登记框架自身的 `READY/STOPPING` 日志监听，在根关闭时统一清理。[GameApplication.register](../src/game/logic/bootstrap/GameApplication.ts) 只登记全局内容和 World 工厂，不集中注册子 World 事件。初始 World 注册时 `READY` 已派发；查询当前就绪状态使用 `lx.ready`。

[LobbyWorld](../src/game/logic/bootstrap/worlds/LobbyWorld.ts) 在自己的 `registerEvents` 订阅 `LobbyWorld.ENTER_BATTLE`，[BattleWorld](../src/game/logic/bootstrap/worlds/BattleWorld.ts) 同样订阅 `BattleWorld.RETURN_LOBBY`。它们都使用本次激活的 `world.events`，UI 点击只发请求，由所属 World 的具名方法处理，再调用应用提供的切换函数。事件监听、UI 路由与 Scene 注册都随该 World 退出清理；再次进入重新创建，不在公共事件源留存。

事件源归属与订阅寿命分别判断：如果子 World 需要监听公共事件，仍在自己的 `registerEvents` 中用 `world.listen(lx.events, ...)` 登记，退出时只卸载自己的订阅。不能因为事件源是公共的，就把所有消费者的注册也搬到框架或 GameApplication。

caller 使用真实的 World、模块或 UI 实例，method 使用稳定的具名方法；不在解绑时重新 bind。每个 `(source, type, caller, method)` 由一个运行期负责，避免同一原生订阅被两个 scope 重复认领。caller 完全归某 scope 时可按记录的各个 source 调用 offAllCaller；否则精确 off。

自定义事件使用明确常量和有类型的 payload，仍由原生 event 发送。优先传单个对象；传数组作为一个参数时遵守原生数组包装规则。原生 event 不等待异步监听，因此启动、销毁等需要 await 的控制流程继续直接调用生命周期方法，不依赖广播完成顺序。[3.4.1 EventDispatcher 源码](https://github.com/layabox/LayaAir/blob/v3.4.1/src/layaAir/laya/events/EventDispatcher.ts)

社区自定义事件实践可以辅助理解原生用法，但不能据此声称 Laya 有统一的大/小 World 标准。已检索的早期社区案例也使用原生事件派发；本项目的所有权树是结合当前需求提出的设计，最终依据固定版本源码。[社区自定义事件实例](https://ask.layaair.com/d/6427-ru-he-yong-dai-ma-diao-yong-an-niu-de-dian-ji-shi-jian-ru-as3-de-dispatchEvent)

## 通用登记与回收

根 World 就是 lx。内部 AppBootstrap 负责顺序与失败补偿；WorldRegistry 负责业务 World 状态。lx.ts 将关闭子 World 安排在全局数据和红点规则停止之前。局部复杂模块仍可通过 WorldScope.startServices 使用已有执行器，不为简单动作新建 Service 包装。

BaseWorld 保留具名类和 protected 初始化钩子。业务通过绑定本次运行期的注册能力创建内容，成功时立即登记回收责任；常见能力无需每个 World 重写配对的 unregister/close。own(cleanup) 保留为特殊资源的扩展点。

| 能力 | 通用层增加的责任 | 底层继续使用 |
| --- | --- | --- |
| 事件订阅 | 记录 source/caller/method、提前解绑、结束解绑 | EventDispatcher |
| UI 注册与打开 | 定义归属、实例所属 Scene/展示、隐藏缓存和待加载归属 | UIRouter/SceneUI、原生 ui2 |
| Scene 注册与打开 | route 与 World 运行期关联；退出关闭实例并撤销专属定义 | SceneRegistry/SceneFlow、Laya.Scene |
| 模块启停 | 具名模块、依赖顺序、初始化补偿、唯一 stop 责任 | AppService 风格、现有生命周期执行器 |
| 异步资源 | 登记原始加载任务、使用者、失效后收尾与释放责任 | Laya.loader、原生节点和 Resource |
| 特殊副作用 | 登记可重复调用的清理动作；需要时记录实际 caller/target | 原生 timer、Tween、Pool、平台 API |

这些适配器只提供模块特有的回收动作，通用执行器按登记记录操作。不能按 World ID 写 switch，也不能在根清理器中继续追加“大厅退哪几个 UI、战斗退哪几个 Scene”。新增业务 World 不应要求修改根清理算法。

同步 LifetimeScope 不能直接承担异步 Scene/World 关闭。实现时复用现有异步 WorldRegistry 记录，并明确异步 pending 与失败状态；不要把异步清理塞进返回 void 的队列后当作已经完成。

Laya 原生对象的绑定适配放在 bootstrap/infrastructure/presentation 等引擎接入位置。domain 及纯生命周期状态契约继续不依赖 Laya；含 Laya 类型的 World 使用接口与纯状态契约分开，不在纯层伪造 EventDispatcher 接口或复制其实现。

## UI、Scene 和资源的归属细节

注册定义和创建实例是不同阶段。根的公共 UI 定义可被小 World 使用，但打开后的实例默认归调用它的 Scene/父展示，再由所属 World 兜底回收。只有明确指定为应用级的全局窗口，实例才归根 World；共享定义不意味着实例也全局常驻。

World 持有专属 UI 注册与 Scene 生命周期，不意味着它必须是可见节点或另造 GRoot。场景 UI 仍挂 `.ls` 声明的 uiRoot，应用窗口仍使用原生 GRoot/GWindow。World 关闭先销毁所属 Scene/UI，再撤销专属注册；定义清理不能先于仍使用它的实例清理。

注册标识需包含 owner 和本次运行期身份；管理器可内部使用组合 key/令牌，业务继续保存返回的 typed route。跨 World 共用根定义时显式借用根 route，子 World 不能获得其注销权限。旧运行期的 unregister 不得移除新运行期同名内容。

资源归属包含实例、动态使用、池中暂存对象和未完成加载。`lx.res` 仍是原生 Loader；World 资源入口只增加运行期登记和晚到失效，不另建 Loader 缓存。资源共享时，关闭一个 World 解除其持有关系，不能按 URL 强制清掉其他 World 或根还在使用的纹理。

层级资源依赖由原生加载器处理；节点、组件和动态持有先释放，加载与渲染稳定后再进入现有 GC 边界。普通资源不按 World 自动打 Loader group，不使用私有引用 API。纯 JSON 数据等非节点内容由模块释放自身引用，Loader 缓存按是否独占与现有公开释放规则处理；不得把“发起了 load”当成已经取得独占销毁权。详见 [资源生命周期](ui-resource-lifecycle.md)。

## 每次进入与退出

业务调用 `await lx.worlds.exit(id)`；[WorldRegistry.beginExit](../src/framework/application/world/WorldRegistry.ts) 先取消信号，再执行登记的逆序清理。不是只注册而不销毁，注册方法内部已经登记了对应清理：

| 注册方式 | 退出时实际执行 |
| --- | --- |
| `world.listen(source, type, this, method)` | [WorldScope.invalidate](../src/framework/bootstrap/WorldScope.ts) 调用原生 `source.off(type, this, method)`，保留其他 World 和根监听 |
| `world.ownCaller(this)` | 退出开始时执行 `Laya.timer.clearAll(this)` 与 `Laya.Tween.killAll(this)` |
| `world.registerScene(route)` | `lx.scenes.unregister(route)` 卸载 Scene；[BaseGameScene.destroy](../src/framework/presentation/scene/BaseGameScene.ts) 清理所属 SceneUI 和原生子节点 |
| `world.registerView(route)` | `lx.ui.unregisterView(route)` 销毁该专属路由的实例、等待加载并移除定义 |
| UI 的 `session.bindData/bindRedDot`、`session.lifetime.defer` | 展示结束时清理数据和红点订阅、按钮事件；具体对称 `on/off` 见 [UIBattle](../src/game/logic/presentation/ui/examples/UIBattle.ts) |
| `world.own(cleanup)` | 执行自行登记的业务或资源清理 |

正常退出时先停事件与定时副作用，并立即启动所有所属 Scene 的注销；再按登记顺序等待同一关闭任务及 UI/业务清理，随后调用子类 `onExit`；已登记的内容不需在子类重复销毁。`onExit` 用于释放本类引用或其他业务收尾，不得依赖 UI 仍然存活。初始化中途取消时也会调用该钩子，之后才结束的异步工作仍必须检查 `signal` 并登记晚到清理；`lx.worlds.exit(id)` 会等这些清理全部结束。

`registered → initializing → active → exiting → disposed`，失败记录单独保留。关闭后可以保留轻量 World 定义/工厂，但必须释放本次激活的对象图；再次进入创建新的 activation、局部事件源、模块和副作用。优先登记创建 World 实例的工厂，避免重用含旧字段的已销毁实例。

1. 初始化：建立运行期与局部事件源，按依赖顺序注册内容、启动模块、打开 Scene；每一步成功立即记录回收动作。
2. 开始关闭：标记失效，拒绝新工作，停止本次事件监听、timer、Tween、外部回调等副作用；父关闭同时使所有子运行期失效。
3. 关闭子级：根先关闭小 World；小 World 关闭自己的 UI、Scene 与子 owner，包括隐藏缓存和加载中的实例。共享父级服务此时仍可供清理使用。
4. 回收专属内容：逆依赖清理模块与定义，等待实际初始化、加载和所有晚到清理。各项错误汇总，其他清理继续执行；失败项留在诊断记录中。
5. 收尾：解除资源持有和局部事件源引用，稳定后进入资源 GC。根在所有小 World 和公共模块结束后释放全局内容。

初始化失败走同一条关闭路径；清理幂等。事件/timer 的先停阶段和最终对象释放阶段需要明确顺序，不能仅靠一条任意注册的逆序队列碰运气。原生加载不可取消时继续跟踪真正的 Promise，晚到结果不能重新注册到已关闭 World，也不能写入同名新运行期。

## 业务类的实际写法

WorldScope 位于 framework/bootstrap，引擎无关的 WorldContext/BaseWorld/WorldRegistry 保持在 application。以下摘录实际 [BattleWorld](../src/game/logic/bootstrap/worlds/BattleWorld.ts) 的注册、事件处理与退出方法；三个注册钩子只提供本类内容，固定顺序在 BaseWorld.initialize 中执行；字段、构造依赖和场景打开见原文件。registerScene 返回本次激活的路由对象，后续打开要使用该返回值。

```ts
protected override registerEvents(world: WorldScope): void {
    world.listen(world.events, BattleWorld.RETURN_LOBBY, this, this.onReturnLobby);
}

protected override registerUI(world: WorldScope): void {
    world.registerView<UILobbyArgs, UIBattle>({
        id: "lx.examples.battle",
        url: "bootstrap/ui/examples/UIBattle.lh",
        bind: (view, args, session) => view.onBind(args, session, this.inventory,
            () => { world.events.event(BattleWorld.RETURN_LOBBY); }),
    });
}

protected override registerScenes(world: WorldScope): void {
    this.scene = world.registerScene(BATTLE_SCENE);
}

protected override onExit(): void {
    // UI、Scene 和局部监听按本类登记的清理责任释放；这里清空保留的引用。
    this.scene = undefined;
}

private onReturnLobby(): void {
    void this.enterLobby().catch(error => logger.error("[World examples] return lobby failed", error));
}
```

偏 C# 的部分是具名类、成员状态、构造依赖、显式访问级别、protected 扩展点和具名处理方法。TypeScript 部分保留 lowerCamelCase 方法/属性、PascalCase 类型、readonly、接口/联合类型、Promise 和模块导入；纯计算与配置仍使用函数/对象。不要求 C# 式 PascalCase 方法、静态服务大全或把每个数据对象写成类。完整约定见 [代码规范](code-style.md)。

## 第一版实现与剩余边界

| 能力 | 实现 | 边界 |
| --- | --- | --- |
| 根就绪 | lx.init 等待 ApplicationConfig.synchronization；snapshot 标记 source/state | 当前演示配置明确为 development-simulator；真实网络 TODO |
| 两级事件 | lx.events、WorldScope.events 都是原生派发器；listen 精确登记/解绑 | UI 展示订阅仍使用 session.bindData 等展示期机制 |
| UI/Scene | registerView/registerScene 自动登记清理，克隆 route 保证本次身份；openScene 绑定 signal | 只接管返回的专属 route；公共定义保持根所有，实例归 Scene/展示 |
| 每次激活 | register({id,create}) 每次创建新的业务类与 WorldScope | 旧 WorldDefinition 对象形式保留兼容；可变业务类使用工厂形式 |
| 通用清理 | ResourceCleanup 接收 participant 列表，统一 stop/drain/retry/稳定后 GC | 新模块在组合根登记；不修改清理算法 |
| 局部模块/资源 | startServices、track、ownResource/own 接入已有异步清理队列 | 先登记资源和模块，再登记依赖它们的 UI/Scene，按逆依赖释放；不强制清理共享 URL |

验收要证明：未收到完整数据或红点未就绪时不进入大厅；同步失败/重试不重复创建模型或规则监听；无小 World 时全局数据和红点仍更新；关闭一个 World 不影响另一 World 或根；根关闭能完整清理全部子 World；注册失败可补偿；关闭重开不会累积监听、模块、UI 或资源；旧回调不能污染新运行期；公共 UI 定义保留但子 World 打开的实例销毁；新增第三种 World 无需修改清理器。真实 Scene/UI/共享纹理行为必须进入相应 Laya Headless 探针。

相关回归在 [组合测试](../tests/game/logic/ApplicationComposition.test.ts)、[WorldRegistry 测试](../tests/framework/WorldRegistry.test.ts)、[启动与 World 原生探针](../tests/game/logic/startup-worlds.browser.mjs) 和 [原生事件探针](../tests/framework/world-events.browser.mjs)。安装包源码基线与实际命令结果单独报告；开发模拟不作为真实网络或支付验收。

## 2026-09-14 验证记录

以下保留单一入口提交 `31573bd` 的阶段记录；父类调度、World 退出竞态修复和下游规则的最新结果见 [框架设计复查](framework-design-review.md)。

- `npm run verify`：全项目快速回归通过，包含源码与测试类型检查、35 个文件的 406 项单元测试、架构与同步完整性检查、源资产/内容资产/资源布局/性能预算校验。保留既有 SceneFlow/SceneUI/UIRouter 文件长度审查提示。
- 工作流测试 ArchitectureAnalysis、CodexWorkflow、BrowserProbePlan、GameCreation、GameProject：5 个文件、55 项测试通过，覆盖架构分析、项目配置、游戏创建和探针选择。
- `npm run check:engine-source`：31 项固定源码一致；Timer/Script/Socket 另与本机 sourcesContent 对照固定 commit 一致。
- `npm run test:headless -- --suite network --probe tests/game/logic/startup-worlds.browser.mjs`：注册方法拆分与 lx.net 入口调整后的代码原地构建成功；HTTP 专项、Loading 启动与失败重试、4 次大厅/战斗切换、局部导航事件与公共源隔离、退出解绑与缓存 UI 销毁、原生 timer/Tween 清理、局部倍速与暂停均通过。
- 同一探针直接调用 lx.net.connectByUrl/send，验证原生 WebSocket 文本/二进制回显、子 World 退出后连接继续存在、根停止后连接与消费者清理、再次初始化使用新 Socket；完整停机且无浏览器错误。
- `npm run check:skills`：27 个公共 Skill 通过；`npm run check:memory`：22 条索引记录通过。上游同步限制的执行逻辑保持不变。

上述引擎验证在 Windows Headless Chromium/SwiftShader 执行，范围是 network 与所列专项；未声明完整 Headless 全套通过，也未验证 macOS、小游戏、Native、真实后端或支付业务。
