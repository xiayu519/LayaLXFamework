# 框架设计复查与资源回归

2026-09-14，基于 `31573bd2c922bd8f241f2d84ed81b82d4a26a3ce` 复查。结论：子类重复编排注册步骤确实违反公共流程归父类的原则，已改正；真实引擎复测还发现并修复了一处 World 退出竞态，因此不能把上一轮资源验证直接当成本轮的通过证据。

补查已完成该阶段全部框架 TypeScript 文件的逐文件代码与设计审查，修复了新增确认的布局订阅回滚和路由类型赋值问题，并完成发布验收及资源、启动/World 专项复测。后续按用户要求删除日志转发文件，统一使用 Logger.ts 导出的 logger；`4afd361` 阶段保留 61 个框架 TypeScript 文件，该调整的验证单独记录。再后的取消兼容工厂使当前框架为 62 个文件，其代码修复、依赖和资源复测见 [平台兼容性](platform-compatibility-review.md)。

## 已修复的问题

| 问题 | 修订后的行为 | 代码与验证 |
| --- | --- | --- |
| Lobby/Battle 各自重复调用三个注册方法 | 父类固定执行准备、事件、UI、场景、进入；子类只提供内容。每阶段检查取消，失败仍执行已登记清理 | [BaseWorld](../src/framework/application/world/BaseWorld.ts)、[阶段顺序及失败补偿测试](../tests/framework/BaseWorld.test.ts) |
| 动态 UI 注册晚于 Scene，逆序清理等待慢加载，延后 Scene 失效 | World 退出开始时立即发起全部所属 Scene 的注销；后续清理等待同一个注销任务，不重复关闭 | [WorldScope](../src/framework/bootstrap/WorldScope.ts)、[真实资源探针](../tests/game/logic/ui-resources.browser.mjs) |
| 公共 STOPPING 监听器抛异常，打断立即销毁 World 的步骤 | 保持原生事件派发，记录通知错误，继续销毁 World 和框架 owner，最终由 stop 的共享任务报告错误 | [lx](../src/framework/lx.ts)、[停机重入与异常测试](../tests/game/logic/ApplicationComposition.test.ts) |
| 下游受管文件差异被强制拒绝 | 开发者选择上游分支或当前项目；本地差异只提示，lock 继续记录来源；同步覆盖已有修改前单独列明并确认 | [同步工具](../tools/framework-distribution.mjs)、[同步测试](../tests/workflow/FrameworkDistribution.test.ts) |

## 父类与子类的职责

`BaseWorld.initialize()` 先登记 `onExit` 补偿，然后统一调用：

```text
onRegister → registerEvents → registerUI → registerScenes → onEnter
```

`onRegister` 是可选准备钩子，用于提前登记局部模块、资源与 timer caller。子类不再用它复制公共步骤；没有该阶段内容时不用覆写。`registerEvents`、`registerUI`、`registerScenes` 同样默认空实现，复杂 World 可在各自阶段内按业务功能继续拆方法。

[LobbyWorld](../src/game/logic/bootstrap/worlds/LobbyWorld.ts) 与 [BattleWorld](../src/game/logic/bootstrap/worlds/BattleWorld.ts) 的具体事件、UI 和 Scene 仍由自身登记，GameApplication 只统一登记 World 工厂并协调跨 World 切换。退出时先停止副作用并启动场景注销，再按登记的逆序等待清理。`onExit` 做本类业务收尾，开发者不需要通过调用 `super` 才能卸载公共登记内容；原始异步任务和晚到补偿继续由已有生命周期实现排空。

这些是模板方法原则在本项目中的具体应用。代码继续采用 [代码规范](code-style.md) 的显式访问修饰符、`readonly`、`override`、具名方法和 TypeScript 类型推导；手写注释使用中文。没有为了形式一致增加新 Context、Host、公共 Update 或另一套模块入口。

## 全框架复查范围

上一阶段只完成了 62 个 TypeScript 文件的结构扫描及关键调用链审查，不能据此宣称逐文件审查完成。用户追问后补齐了全部文件的源码阅读，逐项核对职责、公共契约、依赖方向、类型约束、原生能力、异步清理和代码规范，并对照架构、World、Scene、UI、资源、数据与网络设计说明。后续删除不必要的日志转发文件，下表覆盖 `4afd361` 阶段保留的全部 61 个文件；表内平台和取消实现的后续变化以上述平台修复记录为准。

| 检查面 | 结论 |
| --- | --- |
| 模块入口与依赖 | `lx` 仍是唯一模块持有者；AppEntry 先显示 Loading 再调用 `lx.init`，framework 不依赖 game |
| 公共与局部生命周期 | 全局数据、红点、网络随根框架；子 World 的事件订阅、UI、Scene 随自身激活与退出；这次修复公共编排及两处异常清理边界 |
| 原生能力 | `lx.res` 使用 Loader，`lx.net` 直接返回原生 Socket，HTTP 独立；事件、timer、Tween、Scene、ui2 和 Pool 继续走原生实现 |
| 异步与回收 | 保留失效检查、等待原始加载、owner 销毁和稳定后 GC；取消等待不能冒充底层加载已结束 |
| 大文件 | SceneFlow、SceneUI、UIRouter 的体积提示已逐项审查，本轮保留主体，理由如下 |

三个超过 500 行文件已完成职责审查，本轮决定保留主体。SceneFlow 的版本、旧场景暂停/恢复、提交与回滚共同组成一项切换事务；资源校验和进度报告已独立。SceneUI 的记录、父展示、页面替换与销毁需要共享一致的归属状态；绑定、动画、请求、排序和配置已有独立实现。UIRouter 维护应用 GWindow 的路由与清理，场景实例行为已经交给 SceneUI。继续按方法数量拆分会增加跨对象状态传递，本轮未发现必须以拆文件解决的独立缺陷；这些是已审查后的保留决定，不是遗漏审查。

### 补查发现与修复

- `UILayoutService.subscribe` 首次同步通知抛错时，原来已经添加监听但无法返回解除函数，下一次布局变化会再次调用失败监听。新增失败测试先复现，再加入新订阅回滚，并验证重复订阅失败不会移除原有监听。
- 原先 `SceneRoute<TArgs>` 的直接 `open(route, args)` 调用能够检查参数，但不同 `TArgs` 的路由在结构赋值时仍兼容。新增编译负例复现该漏洞，增加仅用于关联类型的可选 `argsType` 后，错误赋值及 Registry/Flow/World 参数负例均受到检查；真实场景仍收到原来的业务参数。
- 补全 8 个文件中的 15 处控制分支大括号；清理列表和固定布局回调补 `readonly`，HttpRequest 兼容类改为具名并明确 `override`，进度实现文件与主要类同名且保留 UUID，Tip 复用层级容量常量。
- `TipPool` 保留为 UI 消费方的最小契约。其目的在于隔离基础设施实现；直接引用 `PrefabPoolService` 的类型会违反现有 presentation → infrastructure 依赖限制，不应把这种隔离与重复公共流程混为一谈。

### 逐文件审查清单

| 文件 | 审查结论或处理 |
| --- | --- |
| [TablesRegistry.ts](../src/framework/application/config/TablesRegistry.ts) | 单套 Tables 登记与读取；类型断言局限于安装/消费边界 |
| [DataRegistry.ts](../src/framework/application/data/DataRegistry.ts) | 按类型键引用已有数据，重复键拒绝，不创建账号模型 |
| [Logger.ts](../src/framework/application/diagnostics/Logger.ts) | 唯一 logger 实例供直接导入和 lx.logger 共用；删除外部转发文件及别名，保留开关、固定回调与平台样式 |
| [AppService.ts](../src/framework/application/lifecycle/AppService.ts) | 保留最小启停与取消契约，不重复声明所有框架模块 |
| [LifetimeScope.ts](../src/framework/application/lifecycle/LifetimeScope.ts) | 同步逆序清理并聚合错误；持有数组补 readonly |
| [AsyncBindingGuard.ts](../src/framework/application/ui/AsyncBindingGuard.ts) | 代次、父信号解绑及晚到 Promise 处理完整；不冒充底层取消 |
| [BaseWorld.ts](../src/framework/application/world/BaseWorld.ts) | 公共阶段由父类执行，子类只提供内容；部分失败也补偿 |
| [WorldDefinition.ts](../src/framework/application/world/WorldDefinition.ts) | 纯应用层的标识、信号、登记与工厂契约，不依赖引擎 |
| [WorldRegistry.ts](../src/framework/application/world/WorldRegistry.ts) | 唯一子 World 状态机；退出重入、晚到清理和失败诊断保持；补全分支大括号 |
| [AppBootstrap.ts](../src/framework/bootstrap/AppBootstrap.ts) | 顺序启动、逆序停止；进度错误和部分启动失败参与回滚 |
| [ApplicationConfig.ts](../src/framework/bootstrap/ApplicationConfig.ts) | 组合根提供游戏配置与首次同步；无第二套 Runtime/Host 清单 |
| [ClientSettings.ts](../src/framework/bootstrap/ClientSettings.ts) | 存档默认值和音量校验；不在 World 切换时重建全局设置 |
| [FrameworkEvent.ts](../src/framework/bootstrap/FrameworkEvent.ts) | READY/STOPPING 明确表示根生命周期，不代替局部事件 |
| [ResourceCleanup.ts](../src/framework/bootstrap/ResourceCleanup.ts) | 先使 owner 失效，排空加载和原生销毁帧；失败阻止 GC |
| [ServiceOperations.ts](../src/framework/bootstrap/ServiceOperations.ts) | 区分限时等待与实际任务，保留晚到补偿；补全循环大括号 |
| [WorldScope.ts](../src/framework/bootstrap/WorldScope.ts) | 精确卸载所属事件和 caller，立即启动场景注销并复用同一任务 |
| [StateMachine.ts](../src/framework/domain/state/StateMachine.ts) | 纯领域规则；重入和歧义迁移拒绝，effect 成功后提交状态 |
| [AudioService.ts](../src/framework/infrastructure/audio/AudioService.ts) | SoundManager 适配与 BGM/SFX/owner 语义；不宣称清理所有解码缓存 |
| [JsonConfigService.ts](../src/framework/infrastructure/config/JsonConfigService.ts) | 普通 JSON 的消费校验、并发合并和失效；不混入 Tables 或纹理引用管理 |
| [ContentCatalog.ts](../src/framework/infrastructure/content/ContentCatalog.ts) | 不可变 ID/URL 配置映射，不承担实例或 Loader 缓存所有权 |
| [EngineHttpRequest.ts](../src/framework/infrastructure/network/EngineHttpRequest.ts) | 延迟创建原生 HttpRequest 兼容子类；补具名类与 override |
| [HttpPayload.ts](../src/framework/infrastructure/network/HttpPayload.ts) | 发送前固定编码快照；大小写 header 去重和二进制视图范围明确 |
| [HttpTransport.ts](../src/framework/infrastructure/network/HttpTransport.ts) | 超时/取消/重试/错误映射边界明确；POST 重试需幂等键 |
| [NetworkService.ts](../src/framework/infrastructure/network/NetworkService.ts) | lx.net 提供原生 Socket；根负责退役连接的监听与缓冲区清理 |
| [LayaGraphicsCleanup.ts](../src/framework/infrastructure/performance/LayaGraphicsCleanup.ts) | 固定版本的最小原生绘制池兼容；不调用私有引用计数接口 |
| [RenderPerformance.ts](../src/framework/infrastructure/performance/RenderPerformance.ts) | 统计窗口与单位明确；CPU/GPU 资源计数不冒充 JS 堆或硬件实测 |
| [PrefabPoolService.ts](../src/framework/infrastructure/pool/PrefabPoolService.ts) | 实例唯一归属、有界复用、晚到取消和逐节点失败诊断；无自建资源租约 |
| [SaveStore.ts](../src/framework/infrastructure/storage/SaveStore.ts) | 损坏存档保留、未来版本保护与读回验证；不伪称跨标签页事务 |
| [lx.ts](../src/framework/lx.ts) | 唯一模块持有者和初始化顺序；停机异常仍完成清理，公共/局部事件归属明确 |
| [createDefaultPlatformService.ts](../src/framework/platform/createDefaultPlatformService.ts) | 无状态平台选择；实际仅提供 Web/微信适配，Native 需另行实现 |
| [PlatformService.ts](../src/framework/platform/PlatformService.ts) | 宿主视口、时间和外链的最小外部契约 |
| 当时的 `PurchasePlatform.ts`（已替换） | 此次审查时仅为支付边界契约；后续由根 PurchaseModule 和两个接入契约替代，当前实现见 [支付设计](payment-design.md) |
| 当时的 `UnsupportedPurchasePlatform.ts`（已删除） | 此次审查时明确拒绝未实现支付；当前由未配置的 PurchaseModule 保留拒绝行为，未加入生产模拟渠道 |
| [WebPlatformService.ts](../src/framework/platform/WebPlatformService.ts) | 安全区 DOM 探针有启停归属；外链仅允许 HTTP/HTTPS |
| [WeChatMiniGamePlatformService.ts](../src/framework/platform/WeChatMiniGamePlatformService.ts) | 能力检测、视口裁剪及 API 失败回退；设备实测仍独立 |
| [BaseGameScene.ts](../src/framework/presentation/scene/BaseGameScene.ts) | Scene 持有 UI、失效信号和同步清理；原生 destroy 前先停副作用 |
| [SceneFlow.ts](../src/framework/presentation/scene/SceneFlow.ts) | 单路由切换事务与恢复边界；保留主体、补循环大括号 |
| [SceneFlowTypes.ts](../src/framework/presentation/scene/SceneFlowTypes.ts) | 补参数类型关联，阻止不同参数 SceneRoute 相互赋值；保留现有调用路径 |
| [SceneRegistry.ts](../src/framework/presentation/scene/SceneRegistry.ts) | 按路由独立实例，旧定义不能注销新定义，同级未稳定时不提前 GC |
| [SceneResourceBatch.ts](../src/framework/presentation/scene/SceneResourceBatch.ts) | 额外资源声明校验和原生批加载结果校验，不重复层级资源清单 |
| [TransitionProgressReporter.ts](../src/framework/presentation/scene/TransitionProgressReporter.ts) | 进度单调、过期发布失效；文件改为主要类名并保留原 meta UUID |
| [BaseGameWindow.ts](../src/framework/presentation/ui/BaseGameWindow.ts) | 原生 GWindow 与展示期绑定；隐藏、销毁、重入和半完成销毁分别处理 |
| [RedDotBinding.ts](../src/framework/presentation/ui/RedDotBinding.ts) | 已有数据源到 UI 的展示绑定，禁用/销毁解除；注释明确不创建场景数据层 |
| [RedDotStore.ts](../src/framework/presentation/ui/RedDotStore.ts) | 根持有的原生事件数据聚合；整批校验、重入通知与销毁解绑；补循环大括号 |
| [SceneUI.ts](../src/framework/presentation/ui/SceneUI.ts) | 场景/父展示归属、待加载和缓存清理完整；保留主体、补循环大括号 |
| [TipQueue.ts](../src/framework/presentation/ui/TipQueue.ts) | 保留 UI 消费方的最小池契约以隔离基础设施；层级间隔共用 UI_LAYER_CAPACITY |
| [UIBindings.ts](../src/framework/presentation/ui/UIBindings.ts) | 展示期订阅、callLater 合并、暂停和关闭解绑；补循环大括号 |
| [UIDynamicImage.ts](../src/framework/presentation/ui/UIDynamicImage.ts) | 原生 GLoader 的固定版本换图兼容；重复销毁不额外减引用 |
| [UILayer.ts](../src/framework/presentation/ui/UILayer.ts) | 唯一层级枚举、名称和容量常量 |
| [UILayerOrder.ts](../src/framework/presentation/ui/UILayerOrder.ts) | 有界 zOrder 压缩及原生显示顺序；不让长期请求序号无限增大 |
| [UILayoutService.ts](../src/framework/presentation/ui/UILayoutService.ts) | 首次订阅通知失败撤销新登记，保留原订阅；固定 refresh 身份，补大括号 |
| [UIModalOrder.ts](../src/framework/presentation/ui/UIModalOrder.ts) | 只同步 GRoot 原生 modalLayer，不新建应用级遮罩系统 |
| [UIPopupTransition.ts](../src/framework/presentation/ui/UIPopupTransition.ts) | 原生 Tween 的取消、版本与输入恢复；不持有业务窗口生命周期 |
| [UIRequestTracker.ts](../src/framework/presentation/ui/UIRequestTracker.ts) | 请求取消和诊断，父信号解绑；不接管 Loader 缓存 |
| [UIRouter.ts](../src/framework/presentation/ui/UIRouter.ts) | 应用 GWindow 路由及场景 UI 登记；保留主体和两种原生生命周期边界 |
| [UIViewLifecycle.ts](../src/framework/presentation/ui/UIViewLifecycle.ts) | 原生反序列化后的配置检查与 Script 回调；不让错误中断其余原生销毁 |
| [UIViewLifetime.ts](../src/framework/presentation/ui/UIViewLifetime.ts) | 场景/父展示记录类型，复用已有绑定和清理对象，不引入新状态机 |
| [UIViewRegistry.ts](../src/framework/presentation/ui/UIViewRegistry.ts) | 只保存定义，撤销时清理消费实例；过期定义不能删除同 ID 新路由 |
| [UIViewRoute.ts](../src/framework/presentation/ui/UIViewRoute.ts) | 具备实际消费字段的参数/视图契约，session 明确父展示归属 |
| [UIWindowCleanup.ts](../src/framework/presentation/ui/UIWindowCleanup.ts) | 半完成销毁保留诊断，不能只凭 destroyed 放行 |
| [UIWindowRoutePolicy.ts](../src/framework/presentation/ui/UIWindowRoutePolicy.ts) | 无状态窗口配置与排序查询，复用统一层级与清理诊断 |

## 为什么这次必须复测资源

虽然没有改 Loader 的缓存和引用计数算法，但 World 注册与退出顺序会决定 UI、Scene 和异步任务何时失效。扩大到真实 World 的探针首次失败：`UI resources: late scene work created an instance`。

当业务在 Scene 注册之后动态注册 UI 时，原来的逆序清理先等待该 UI 的慢加载；Scene 尚未失效，另一个待完成的 Prefab 获取因此创建了节点。修复后，World 失效会立即通过已有 SceneRegistry 启动原生关闭；清理队列随后等待同一个任务并报告错误。没有新增手动减引用，也没有修改 UIDynamicImage 或既有原生绘制清理兼容逻辑。

资源专项现覆盖 13 种情况：普通换图、按钮图标、九宫格、图集动画、虚拟列表、循环列表、真实 World 离场共享图集、取消共享池加载、销毁后晚到图片、复用行晚到图片、晚到图集动画、异步绑定中关闭、带未完成 UI/Pool 工作退出 World。

虚拟及循环列表覆盖 6 个创建销毁周期、144 次刷新；真实 Lobby World 共享图集覆盖 3 次退出重入。断言不只观察纹理包装对象：World 退出后，另一 owner 持有的图集引用为 1、对应 bitmap 仍存活；无人持有的图集引用为 0、bitmap 被 GC；最后一个 owner 释放后剩余图集和 bitmap 也被回收。列表刷新期间检查引用不为负，重复 destroy 与换图检查计数平衡。

## 框架补查完成时的验证记录

以下全量验收对应日志入口统一之前的代码；后续日志调整的验证另列，不将旧构建当作新代码的运行证据。

| 验证 | 结果 |
| --- | --- |
| `npm run verify:release` | 通过：47 个测试文件、523 条测试，源代码/测试类型、依赖边界、资源、配置、原地构建、发布包及全部内置浏览器探针通过 |
| 受影响工作流测试 | FrameworkDistribution、GameCreation、GameProject、CodexWorkflow、EvaluationPolicy：5 个文件、49 条通过，亦包含在最终全量测试中 |
| `npm run validate:game-workflow` | 游戏模板生成规则通过 |
| 其余发行检查 | `doctor`、`tables:check`、`validate:assets:laya`、`check:memory` 等均随本次 verify:release 通过；专项复用其中完成的构建 |
| `npm run check:engine-source` | 固定 LayaAir 3.4.1 commit `f368b43098fe6bde7b961546114e71907c5f8a98` 的 31 个源码基线文件通过 |
| 资源专项 | 复用最终构建运行 `test:browser -- --suite targeted --probe tests/game/logic/ui-resources.browser.mjs`，13 项通过，6 个列表周期、144 次刷新、3 次 World 图集共享回归 |
| 内置完整探针与启动/World 专项 | 内置完整探针随发布验收通过，含 100 次 UI/Pool 循环；复用构建运行 `test:browser -- --suite targeted --probe tests/game/logic/startup-worlds.browser.mjs`，4 次 World 切换、原生事件、时间倍率、HTTP/WebSocket、启动失败重试及完整停机通过 |
| 代码规范扫描 | 62 个文件的控制分支、类成员访问范围与 228 条实际注释检查通过；逐文件设计判断另见清单 |
| 工作流静态与语义验证 | 27 个公共 Skill 随最终验收通过；下游位置选择及邻接反例共 6 个语义案例、下述实际执行证据沿用此前结果，相关决策规则未变 |
| 工作流实际执行 | 独立代理读取最小下游夹具后，在写入前询问位置；选择当前项目后修改共享类型与调用方并通过检查，不重复确认；上游文件和来源 lock 保持原样 |

本次真实引擎证据来自 Windows 上的 Headless Chromium/SwiftShader。上述计数和销毁断言支持所列路径没有观察到泄漏、误释放或重复减引用，不能证明任意业务、无限循环或长时间 JavaScript 堆行为。macOS、小游戏、Native、真实服务器/IAP、代表性音频/Spine 资产和长时堆快照未在本轮验证。

## 日志入口统一后的验证记录

2026-09-14，删除日志转发脚本及其 meta，调用方直接导入 Logger.ts 的唯一 logger 实例，lx.logger 指向同一对象；同步更新架构检查与使用文档。未发现需要为 logger 另取别名的冲突。

| 验证 | 结果 |
| --- | --- |
| `npm run typecheck` | 源代码与测试类型检查通过 |
| `npm run check:architecture` | 通过；三个大文件仍采用前述已审查的保留决定 |
| 相关单元测试 | Logger、AppEntry、ApplicationComposition、BaseGameWindowTransition、SceneUI、TipQueue、ArchitectureAnalysis：7 个文件、123 条通过，包含共享实例及同名 SDK 全局隔离 |
| `npm run validate:assets` | 19 个层级文件、165 个 meta UUID 通过；已删除脚本的 UUID 无残留引用 |
| `npm run test:headless -- --suite targeted --probe tests/framework/logger-color.browser.mjs` | 当前代码原地重新构建及发布包校验通过；框架启动、IDE 原生解析器黄色文本、浏览器 CSS 参数、原文和对象保留、plain 输出及完整停机通过 |

本次日志探针未设置 WX_DEVTOOLS_PACKAGE，微信格式化器返回 tested=false；该宿主的历史验证和性能采样仍以 [统一日志](logging.md) 中的独立记录为准。本次没有重新运行全量发布验收或资源专项，不扩大日志调整的验证结论。

下游的具体选择、来源核对与同步覆盖规则以 [框架发行与下游同步](framework-distribution.md) 为准。
