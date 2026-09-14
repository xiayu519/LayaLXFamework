# Architecture

## 根 World 与业务 World

lx 本身就是长期存在的框架根，直接持有公共事件、全局数据、红点和公共模块。AppEntry 先打开固定 Startup Loading，再调用 lx.init；模块创建与初始化顺序集中在 src/framework/lx.ts。业务小 World 只持有自己的 UI 注册、事件订阅、Scene、模块及资源，关闭时统一回收。

IAP 游戏的根启动顺序为：初始化全局系统和数据接收入口 → 连接服务器与首次同步（TODO）→ 数据及红点状态就绪 → 根 World Ready → 进入 LobbyWorld。网络连接成功不能代替数据同步完成；协议接入尚未实施，现有本地模拟不能冒充真实同步。

原生 EventDispatcher 提供 lx.events 和 WorldScope.events，WorldScope 补订阅与内容的 owner 登记；Laya.timer、Scene、Loader 和 ui2 继续使用原生能力。World 不需挂载节点，也不新增全局 Timer/Update。接口、原生依据和网络 TODO 见 [World 生命周期设计](world-lifecycle-design.md)。

框架自身的公共事件与监听在 lx.ts 登记：FrameworkEvent.READY 表示全局模块和首次数据同步完成，随后才进入 initialWorld；STOPPING 在根开始停止、子 World 失效之前派发，完成停止仍需 await lx.stop()。子 World 的局部事件由自己的 registerEvents 在 world.events 上登记；即便监听公共源，也由该 World 持有订阅并在退出时卸载。GameApplication 不集中登记子 World 事件。

纯 application 的 WorldContext 仍只有 id/signal/own；运行时由组合根注入 bootstrap/WorldScope，业务类使用 BaseWorld<WorldScope>。根使用已有 AppBootstrap 管理服务，子 World 使用已有 WorldRegistry 管理状态，避免建立重复的状态机。

## 业务开发入口

业务通过 lx.* 访问根直接持有的模块。新增框架模块时在 lx.ts 声明成员并加入同一初始化/清理流程；不再维护 Runtime、Host、Facade 和重复 Context 模块清单。

| 当前目的 | 已有写法 | 所属范围 |
| --- | --- | --- |
| 打开场景内页面或弹窗 | `BaseGameScene` 中 `this.ui.show(route, args)` | 当前 Scene |
| 从页面打开子窗口 | `session.show(route, args)` | 当前页面展示 |
| 从页面打开独立页面 | `session.ui.show(route, args)` | 当前 Scene |
| 打开应用级窗口或提示 | `lx.ui.show(route, args)` / `lx.ui.tip(message)` | 应用 |
| 数据变化后刷新界面 | 注入功能 Context，`session.bindData(...)` | 数据归账号/业务，订阅归展示 |
| 显示红点 | 业务更新计数，`session.bindRedDot(...)` | 计数归业务，绑定归展示 |
| HTTP 请求 | `lx.http.request(...)` | 每个请求自己的取消与超时 |
| WebSocket | `lx.net` 的原生事件/connectByUrl/send | 根持有连接，子 World 只管理自身订阅 |

场景 UI 与应用 UI 使用各自注册的 route；不为统一调用外观改变宿主和清理范围。现有背包 UI 默认通过 Context 接收依赖；`lx.data.get(key)` 是同一账号数据的可选查询入口，详见 [数据绑定](ui-data-binding.md)。基础例子无需先理解全部内部类型。

## 设计取舍

项目按单人开发、单人维护定位。采用 Tyou 的直接模块所有权与显式生命周期，同时遵守 TypeScript 类型和 Laya 原生能力。框架根只有 lx，AppBootstrap 是内部顺序执行器；业务不需要创建第二个运行时。对比依据见 [Tyou 架构复查](architecture-simplification-notes.md)。

结构与命名遵循 [代码约定](code-style.md)：状态和生命周期由具名类承载，真实共有流程提供基类扩展点；运行时 lx 与属性/方法使用 lowerCamelCase，类与 Runtime 脚本使用 PascalCase。

统一诊断使用 [Logger.ts](../src/framework/application/diagnostics/Logger.ts) 导出的唯一 `logger` 实例，通过 `logger.log/error` 输出，`enabled` 同时控制两种输出，启动前也可用。直接导入不依赖框架初始化、不注册全局变量；`lx.logger` 指向同一对象。UI 模块直接依赖该诊断模块，避免回引 lx。日志不保存历史、不参与 World 生命周期，见 [统一日志](logging.md)。

## 基线

项目固定使用 LayaAir `3.4.1`、2D、`laya.ui = ui2`，不启用 `laya.d3`。设计顺序是：先确认 Laya 官方源码与公开 API，再添加有明确业务语义、失败边界和验证方式的薄扩展。

src/framework/ 是公共能力层，不依赖 game；src/game/logic/ 是保留的可调用脚本库，命名游戏位于 src/game/<game-id>/。AppEntry 从 src/game/bootstrap/GameStartup.ts 获取选定的游戏配置和 StartupScene，随后直接调用 lx.init。当前模板选择 logic 中的演示配置；命名游戏接管该文件即可，无需创建 Runtime 或工厂。

资源归游戏维护：`assets/bootstrap/` 下直接放 `scenes/`、`ui/`、`config/`、`tables/` 等类型目录，没有 framework/game 资源归属层。应用组合根提供 `tipPrefabUrl` 与可选 `createSceneLoadingPresenter`；具体 Loading Runtime 和原生生成字段也在 game。框架同步只更新通用能力，不覆盖启动界面，详见 [资源布局](resource-layout.md) 与 [发行边界](framework-distribution.md)。

## Laya 原生边界

| 领域 | 直接使用 | 项目扩展 |
| --- | --- | --- |
| 事件/时间/动画 | Event、`Laya.timer`、Tween | `LifetimeScope` 仅聚合异构清理；不建立新 Timer |
| 资源 | `Laya.loader`、Resource 引用计数、`Scene.gc()` | `ContentCatalog` 映射 ID/URL；`lx.config` 增加 JSON 校验和显式释放 |
| 场景 | `Laya.Scene.open/close/destroy/gc` | `SceneRegistry` 持有各 route 原生实例；内部 `SceneFlow` 处理切换，`BaseGameScene` 持有场景 UI |
| World / 账号数据 | 普通对象、AbortSignal、原生事件 | `WorldRegistry` 协调注册与撤销；`DataRegistry` 引用应用预先创建的功能数据 |
| UI | ui2 `GRoot/GWindow/GWidget/GLoader`、IDE Runtime/属性引用 | 独立的 owner/host/layout、参数路由和展示期数据订阅 |
| 红点 | `EventDispatcher`、Script 生命周期、IDE 引用 | 路径计数聚合与 `RedDotBinding`，业务自行决定亮灭 |
| 对象池 | `Laya.Pool` | Prefab 异步创建、容量、所有权和 reset 钩子 |
| 音频 | `SoundManager` / `AudioDataCache` | BGM/SFX、handle、owner 与用户设置 |
| Spine | `.lh` + `Spine2DRenderNode.source` | 复用时走通用 Prefab 池，不设 SpineService |
| 存储/网络 | LocalStorage、HttpRequest、Socket | schema 迁移、HTTP 错误契约与原生 Socket 的根生命周期 |
| 配表 | `Loader.BUFFER` | Luban 生成的业务 Tables 安装到 `lx.tables` |

`lx.res` 返回原生 Laya.loader；普通原生场景直接使用 Laya.Scene。托管场景使用 `lx.scenes`，业务初始化协调使用 `lx.worlds`，独立账号数据通过 `lx.data.get(key)` 读取，应用停机使用 `await lx.stop()`。lx 直接持有模块，不增加原生 Scene 转发入口。

## World、Scene 与账号数据

公共 UI 和 World 工厂在 GameApplication 组合根准备，公共服务由 AppBootstrap 启停；注册不加载实例。业务类继承 BaseWorld<WorldScope>，按需覆写准备、事件、UI、场景和进出钩子；共同顺序由父类维护。WorldScope 自动登记专属 UI/Scene 清理，listen 记录原生订阅，startServices 复用服务启停，track/ownResource 接入异步资源归属。WorldRegistry 保持唯一的子 World 状态机：退出先失效；WorldScope 立即启动全部所属 Scene 的注销，使场景和 UI 的取消不被后登记的慢清理阻塞，随后逆序等待清理、原始任务及晚到补偿，失败保留诊断。Scene/UI 实例由既有管理器保存并归属于该 World；账号数据和全局红点独立于子 World。一个 World 可管理多个 Scene，不同 World 可以共存。

LobbyWorld、BattleWorld 的工厂统一登记在 GameApplication.register()；BaseWorld.initialize 固定执行 onRegister 准备、registerEvents、registerUI、registerScenes 和 onEnter，各阶段之间检查取消；子类只覆写内容钩子。UI 点击先发所属 World 的局部导航请求，由该 World 的具名处理方法调用注入的切换函数；GameApplication.switchWorld 只协调跨 World 切换与并发合并。账号与红点规则由该配置的 initialize/dispose 启停。框架全部模块由 lx 创建，ResourceCleanup 只实现停止 owner、等待原生收尾和 GC，不持有另一份框架模块。

`lx.scenes.register/open/get/close/unregister` 管理每个 route 的实例。不同 route 并存，重开同 route 只替换自身实例；不猜“当前场景”、不调用全局 closeAll。场景根 Runtime 继承 BaseGameScene，通过 .ls 原生引用的 uiRoot 持有 SceneUI。2D 摄像机放 Area2D，页面/HUD/弹窗放其同级 uiRoot；只有应用 Loading 等进入 GRoot。

同 route 的内部 SceneFlow 依次处理旧实例回收、层级与动态附加资源、onPrepare、open(false)、onWaitUntilReady 和 Loading。describeResources 仅列运行时必需的动态资源，不重复层级依赖，也不充当卸载清单。关闭或取消后仍等待原生加载和 UI bind 收尾；同级场景切换未稳定时避免提前全局 GC。完整用法及失败边界见 [场景与 World](scene-flow.md)。

账号数据按背包、角色、任务等大功能在组合根预先创建，DataRegistry 只保存引用；登录协议可在任何 UI/World 创建前写入。数据不认识 route 或消费它的界面列表。查询、命令、协议接收分别注入，先落模型再发原生事件；World 切换保留账号数据，退出账号使旧 receiver 的代次失效。模拟服务的权威模型也在外层单独创建，不在服务或 UI 内偷偷 new 一份账号状态。

## UI 生命周期

owner 决定生命周期，host 决定实际父节点，layout 决定适配。应用 `lx.ui` 使用原生 GRoot/GWindow；场景 `.ls` 直接声明 `uiRoot: GWidget`，`BaseGameScene.ui` 按需创建 SceneUI。场景的所有布局（含 center-popup）用 `registerView({ id, url, bind? })` 注册原生 GWidget Runtime，经 `this.ui.show(route,args)` 挂 uiRoot。不为场景另建 GRoot，也不改原生默认实例。

布局订阅归对应 UI 对象持有。UILayoutService.subscribe 首次同步通知抛错时撤销本次新增监听，避免构造失败且无法取得解除函数的对象被长期保留；已有相同回调的订阅不会被失败的重复登记移除。

`session.show()` 打开的子 UI 归当前展示，父关闭自动销毁子窗口、隐藏缓存和待加载；`session.ui.show()` 打开的独立 UI 归场景，父页面关闭不影响它。singleton 按 owner 隔离，hide 只在 owner 存活期间复用。全屏通过 openMode:replace/stack 选择关闭下层或叠加；replace 在新窗口准备成功后结束旧展示，stack 保留下层运行。独立弹窗不参与替换，父关闭仍清理其子窗口。范围与返回流程见 [UI 层级与打开方式](ui-navigation.md)。

场景窗口的 layer、layout、openMode、modal、closeOnMaskClick、multiplicity、retention 在 Prefab 根节点的 UIViewLifecycle 静态组件中配置；UIViewRoute 只保留 id/url、可选 bind 与 onClosed(view,args)。Popup 模板预置模态和空白点击关闭；场景用 uiRoot 内的局部 Sprite 遮罩，应用用原生 GRoot.modalLayer，都放在最高可见模态窗口正下方。框架按层级与展示请求顺序设置有界 zOrder，并同步原生子节点顺序；内部 top/full/mid/bottom 不代替窗口层级。应用关闭钩子使用 BaseGameWindow.onClosed()，均不假定关闭后节点仍可用。

场景 UIViewLifecycle 显式选择 fullscreen 或 center-popup，不用 layer 推断布局。应用 GWindow 的 UIRoute 保留独立配置，并支持 safe-screen。窗口固定 Root 下 full、safeContent；safeContent 下依次为 top、full、mid、bottom。节点始终保留，空 top/bottom 高度为 0，空容器不拦截输入。center-popup 只对 mid 播放缩放开合动画，全屏布局不播放；关闭/销毁取消旧 Tween，并隔离晚到回调。UILayoutService 以运行时逻辑尺寸为边界换算平台坐标，项目可自由选择设计分辨率；完整约定见 [ui-layout.md](ui-layout.md)。

`register/registerView` 返回保留参数类型的 route，`show(route,args,{signal})` 检查参数；字符串入口不具有同等类型保证。原生 `bind(view,args,session)` 提供展示期 lifetime/token、子窗口 show 和数据/红点绑定。同步赋值直接执行，跨 await 的表现回写检查 token；业务结果先落独立模型，不因 UI 离开丢失。取消只结束框架等待，不可取消的原生加载继续被追踪，晚到完成不能重新显示已离场 UI。

```text
Laya.loader.load(.lh, HIERARCHY)
  -> Prefab.create() + 原生 Runtime/属性引用完成反序列化
  -> 场景 UIViewRoute: 注入依赖 -> Runtime.onBind(args, session, ...) -> Scene.uiRoot（含弹窗）
  -> 应用 UIRoute: BaseGameWindow -> 原生 GRoot
  -> Hide 结束展示；owner 结束销毁其所有实例和缓存
```

固定节点、布局和脚本必须来自 `.ls/.lh`。界面 Runtime 集中保存交互、刷新和局部状态；可编辑参数放静态 Script 组件。路由可注入依赖并调用、返回其 onBind；未提供 bind 时直接调用静态 Runtime.onBind(args,session)，无需导入具体 Runtime 构造类。窗口模板预置静态 UIViewLifecycle，SceneUI 要求该组件存在且启用，不再动态 addComponent；原生禁用/销毁继续触发展示清理。复杂界面优先 IDE Runtime + `.generated.ts`，少量引用可放在静态 Script 的原生 `@property` 中；不手改生成文件、不维护平行 Binder、不在构造函数访问未反序列化的引用。两个 full 保持节点名，但不得导出成同一 Runtime 中的同名字段；可用 backgroundFull/contentFull 属性引用分别指向它们。会换图的 UI 复用 UIDynamicImage.lh 组件并设置 src；其 Runtime 修复 3.4.1 已显示图片替换的重复引用问题，仍由原生 GLoader 拒绝过期加载。Web 渲染单元池的纹理/owner 暂留由限定版本的 LayaGraphicsCleanup 修复，详见 [资源生命周期](ui-resource-lifecycle.md)。

业务模型与协议 snapshot/patch 入口独立于 UI；domain/application 保持纯净，Laya EventDispatcher 适配留在 infrastructure/presentation。数据先落再 event，`session.bindData` 首次同步读快照，后续通过原生 callLater 合并，暂停/关闭解除订阅，恢复重读；应用 BaseGameWindow 提供同名 protected 方法。具体示例见 [数据绑定](ui-data-binding.md)。

红点通过 `lx.ui.redDots.set/setMany` 更新，路径计数自动聚合；`session.bindRedDot` 或 IDE RedDotBinding 负责显示，多节点可以绑定同一 key，GList 换身份先解除旧绑定。亮灭规则保留游戏层，不轮询 UI，也不在窗口关闭时清空账号数据，详见 [红点使用](ui-red-dots.md)。

`BaseGameWindow.destroy()` 在进入原生 `GWindow.destroy()` 前暂时解除路由 observer，避免 `hideImmediately()` 触发 Hide 后再次进入 Destroy；清理失败会聚合报告，路由可重试仍未销毁的窗口。

原生 destroy 可能先设置 destroyed 再因用户回调抛错，此时 destroyed 不等于完整清理。UI 保留 cleanup-failed 条目和 `cleanupDiagnostics()`，后续 dispose 继续报告，不因第二次调用无事可做就误放行 GC。

公共提示通过 `lx.ui.tip(message)` 进入 `UILayer.Toast`。第一条立即显示，后续按 FIFO 每 500ms 出队；固定 `UITip.lh` 实例由 `PrefabPoolService` 复用，动画直接使用 `Laya.Tween`。回池会停止 Tween、移除父节点并复位文字、透明度、缩放和可见性；UI 停机清队列、Timer、活动实例与晚到 acquire。

## JSON 与 Tables

`lx.config` 只处理通用 JSON 文档，适用于外部游戏数据、地图/关卡编辑器输出和业务配置。它通过 `ContentCatalog` 的 `data` ID 调用原生 `Loader.JSON`，可在消费边界提供校验器，并支持并发合并、查询、显式释放和晚到结果失效。

`lx.tables` 只保存 Luban TypeScript-bin 生成的 `Tables`。人工源位于 `Design/Tables`；具体生成位置由下游 `settings/GameProject.json` 指定，模板默认把可调用的表逻辑生成到 `src/game/logic/generated/tables`，数据输出到 `assets/bootstrap/tables`。命名游戏需要独立表代码时再显式调整配置。两条数据链没有依赖关系。

## 资源与释放

默认层级资源加载不传 `group`。LayaAir 3.4.1 的 `HierarchyLoader` 会把 load options 传播给依赖，而 `clearResByGroup()` 会强制销毁组内缓存且不会移除 `groupMap` 成员；把共享纹理纳入功能 group 会产生跨所有者误卸载风险。只有依赖闭包完全独立且确实需要显式整包卸载时，业务才可直接使用 Laya group，并承担完整所有权证明与专项测试。

正常释放顺序：使异步回写失效，解除 Event/Timer/Tween，销毁窗口、场景或池中节点，等待加载和渲染提交稳定，再在功能切换或停机边界调用 `Laya.Scene.gc()`。显示命令和 `Spine2DRenderNode` 会维护 Resource 引用；业务禁止调用 `_addReference/_removeReference/_clearReference`。

`PrefabPoolService` 只缓存实例，不私自持有 Prefab resource lease。归还时先脱离父节点、执行 reset，再交给唯一签名的 `Laya.Pool`；超出 `maxIdle` 直接销毁。排空会销毁所有 idle 节点，运行时停机等待晚到加载后再执行 `Scene.gc()`。

逐节点清理失败不会阻止其余节点销毁。`cleanupDiagnostics()` 保留 pool、节点、尝试次数与可重试性；Laya 原生 destroy 半途已置 `destroyed=true` 时不能用私有 API 强行补尾，也不能当成功丢弃诊断。

`SoundManager` 的解码缓存由 `AudioDataCache` 管理，不属于普通 Loader group。`AudioService` 只增加业务声道语义，不宣称统一卸载音频缓存。

## 存档与网络失败边界

`SaveStore` 只在键不存在时持久化默认值。损坏 JSON、非法 envelope、缺失/失败迁移和非法数据返回带 `recovery` 原因的默认值，但保留原始存档；未来版本继续抛出 `UnsupportedSaveVersionError`，禁止降级覆盖。

未来版本保护同时作用于直接 `save()`；存储读写/删除异常以及写后读回不一致统一为 `SaveStorageError`。保持现有 envelope，不引入隐式格式迁移。读回验证可发现不支持存储等静默失败，但不是跨标签页事务、CAS 或断电原子提交保证。

`HttpTransportError` 提供 `kind/status/retryable/attempt/maxAttempts`。默认不重试；GET/HEAD 或带显式 `idempotencyKey` 的 POST 才能启用最多 5 次尝试，并只重试网络、超时和配置的瞬时 HTTP 状态。取消、参数、初始化和同步派发错误不重试。timeout 与 retry delay 限制在宿主 timer 的 `0..2_147_483_647ms`，jitter 后仍不超过 `maxDelayMs`，避免超大值在 Node/浏览器被截断为近即时执行。

保留原生 `Laya.HttpRequest` 发送/事件通道，仅通过 protected `_onLoad` 修正 3.4.1 未接受完整 2xx 的行为。JSON 在框架边界解码，HEAD/204/205 返回 null；parse/schema 错误不重试。响应提供平台/CORS 可见的小写 headers，`validate` 可收紧结构。发送前规范大小写 header、拒绝重复字段，并冻结本次重试共用的编码结果；ArrayBufferView 按 byteOffset/byteLength 精确发送。

## 内容资产门禁

`AssetImportPolicy.json` 固定 2D 纹理、图集、音频和 Spine 3.8 导入规格。`validate:content-assets` 校验真实 `.meta` 与文件头；它不替代目标设备的压缩纹理、音频解码、Spine 动画和性能验收。详细规则见 [asset-import.md](asset-import.md)。

## 启动与停止

CompilerSettings.mainScript 通过 AppEntry.ts.meta UUID 指向 main，引擎已先完成 Laya.init。AppEntry 先打开 StartupScene，等原生 Loading 可显示后调用 await lx.init(new GameApplication(progress))；启动成功关闭 Loading，失败显示错误并调用 lx.stop。并发 main 等待同一次启动；正常停机后重新初始化的仍是同一个 lx 对象。

Startup 原生引用 `UISceneLoading.lh`，保留完整 UI 骨架并复用 UILayoutService；不经过尚未初始化的 lx.ui。模板 HTML 闪屏保持关闭。BootstrapOptions.onProgress 报告已完成服务数；进度额外为初始 World 预留一个工作项，根 Ready 后仍显示场景加载，完成前不提前显示 100%。该百分比表示工作项，不代表下载字节或预计耗时。观察者抛错触发回滚，启动结束后解除回调引用。

lx.init 等待 ApplicationConfig.initialize 和 synchronization.synchronize；全局模型及红点就绪后 ready 为 true，再进入 initialWorld。init/main 会继续等待首次 World 完成，随后销毁 Startup 并输出 [LX] READY。当前演示同步来源明确标记为 development-simulator，真实服务器和 IAP 权益接入仍为 TODO。

内部 AppBootstrap 顺序启动、逆序停止，失败步骤也参与补偿。AbortSignal 提供协作式取消，停止方法应幂等并能处理部分初始化。默认每步初始化 30s、停止 10s，可经 ApplicationConfig.lifecycle 配置。超时后仍追踪原始任务并处理晚到补偿；停机前后均通过 lx.snapshot() 查询状态，不再保存或解绑另一份 Runtime。

lx.stop 先保存共享停止任务并派发 FrameworkEvent.STOPPING，随后立即失效子 World，等待其关闭后停止全局业务与框架模块；通知中的重入 stop 复用同一任务；监听器抛错也继续失效和清理，结束后由停止任务报告错误。ResourceCleanup 等待原生组件延迟销毁和原始加载，稳定后才执行 Scene.gc。未完成或失败的清理会阻止再次初始化；不再使用 Runtime 绑定、隔离集合或后台重检。旧异步任务仍需失效与补偿。

## 验证证据

`settings/LayaSourceBaseline.json` 固定官方 `v3.4.1` commit 和 31 个关键 TypeScript 文件的哈希（含 Node、Sprite、统计窗口与 GPU driver）。`npm run check:engine-source` 从本机 CLI 的 `.js.map` 提取完整源码离线比对。

Headless Chromium 真实探针覆盖：JSON 与 Tables、`Laya.timer.clearAll`、GLoader 晚到请求、共享纹理引用、Prefab 池、Tip 队列/动画/复用、UI 跨代绑定/取消/跨层 modal、100 次 UI/Pool owner 计数回归、HTTP 2xx/空响应/二进制/取消，以及 框架根完整停止与缓存释放。循环计数不等于长期 heap 泄漏证明，SwiftShader 不等于目标硬件性能。图片/音频/Spine 静态策略另由 `validate:content-assets` 覆盖。

架构门禁使用 TypeScript AST 和 tsconfig 模块解析，覆盖静态、动态、side-effect、export、require 和 alias。类型依赖仍检查分层但不计入运行时环；不可静态定位的动态模块路径明确拒绝。它不是任意 eval/运行时元编程的安全沙箱。

本轮单一入口、World 注册拆分与 lx.net 接入的实际结果见 [验证记录](world-lifecycle-design.md#2026-09-14-验证记录)，不把探针能力列表当作本轮全套通过证明。

父类公共调度、资源释放竞态和下游实施位置的最新复查见 [框架设计复查](framework-design-review.md)。
