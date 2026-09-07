# Architecture

## 基线

项目固定使用 LayaAir `3.4.1`、2D、`laya.ui = ui2`，不启用 `laya.d3`。设计顺序是：先确认 Laya 官方源码与公开 API，再添加有明确业务语义、失败边界和验证方式的薄扩展。

`src/framework/` 是 2–3 人共享层，不依赖 `src/game/`；`src/game/logic/` 是不可删除、可被具体游戏调用的业务逻辑脚本库，不代表一个游戏。用户命名后的具体游戏位于 `src/game/<game-id>/`，可依赖 logic；logic 不得反向依赖具体游戏，具体游戏之间也不得互相依赖。`src/Main.ts` 是稳定生命周期外壳，只调用下游所有的 `src/game/bootstrap/createApplication.ts`。在尚未接入命名游戏时，该桥接入口委托给 `src/game/logic/bootstrap/createGameApplication.ts` 保持模板可运行；具体游戏开始后由其显式接管组合，不使用 DI 容器。

## Laya 原生边界

| 领域 | 直接使用 | 项目扩展 |
| --- | --- | --- |
| 事件/时间/动画 | Event、`Laya.timer`、Tween | `LifetimeScope` 仅聚合异构清理；不建立新 Timer |
| 资源 | `Laya.loader`、Resource 引用计数、`Scene.gc()` | `ContentCatalog` 映射 ID/URL；`LX.Config` 增加 JSON 校验和显式释放 |
| 场景 | `Laya.Scene.open/close/destroy/gc` | `SceneFlow` 编排低峰值切换、失败保护与场景级回收；`BaseGameScene` 声明动态附加资源和切换钩子 |
| UI | ui2 `GRoot/GWindow/GWidget/GLoader` | 路由、分层查询、窗口参数与生命周期约束 |
| 对象池 | `Laya.Pool` | Prefab 异步创建、容量、所有权和 reset 钩子 |
| 音频 | `SoundManager` / `AudioDataCache` | BGM/SFX、handle、owner 与用户设置 |
| Spine | `.lh` + `Spine2DRenderNode.source` | 复用时走通用 Prefab 池，不设 SpineService |
| 存储/网络 | LocalStorage、HttpRequest | schema 迁移与稳定错误契约 |
| 配表 | `Loader.BUFFER` | Luban 生成的业务 Tables 安装到 `LX.Tables` |

`LX.Res` 返回准确的 `Laya.loader`，`LX.Scene` 返回准确的 `Laya.Scene`；需要完整切换事务时使用 `LX.SceneFlow`。`LX` 不暴露整个 runtime，也不提供 `LX.Spine` 之类的平行入口。

## 场景切换

业务场景根节点继承 `BaseGameScene<TArgs>`，在应用组合的 `configureSceneFlow` 中注册 typed route，经 `LX.SceneFlow.open(route, args, options)` 打开，完整示例见 [scene-flow.md](scene-flow.md)。`showLoading` 与 `autoCloseLoading` 均默认 `true`；默认 Loading 是 `UILayer.System` 上 `retention: "hide"` 的单例 ui2 `.lh`，因此复用 `GRoot` 且不随业务 `Scene` 销毁。2D 战斗摄像机应放在业务场景的 `Area2D` 内，UI 留在 `GRoot`，不建立 Unity 风格的 `UICamera`。

切换顺序固定为：显示 Loading、暂停并最终清理旧场景、等待一帧并执行 `Laya.Scene.gc()`、加载 `.ls` 层级及其依赖、加载 `describeResources(args)` 返回的运行时附加资源、执行 `onPrepare`、打开新场景、等待 `onWaitUntilReady`、提交新场景、报告 `ready: 100%`，再等待一帧按策略隐藏 Loading。这样加载新场景时旧场景节点和无引用资源已退出，避免两套业务场景同时占用峰值内存。框架以 `cleanup/scene/resources/prepare/switch/ready` 六阶段输出单调总进度；`scene` 和 `resources` 也保留独立进度。

`describeResources` 不是卸载清单：`.ls/.lh` 已声明的依赖不应重复列出，只声明由参数、配置或关卡数据动态选择且必须在显示前就绪的资源；这些资源应从 `onPrepare` 起消费，不在构造或反序列化期间假设其已加载。离场副作用通过 `onTransitionPause/onTransitionResume/onTransitionLeaving` 管理，同步 owner 清理通过 `own()` 登记。旧场景进入最终释放后不再承诺回滚；此后新场景失败会销毁半成品并让 Loading 保持失败状态，下一次 `open()` 可直接重试或进入兜底场景。连续切换或外部 `AbortSignal` 会使旧请求失效，晚到结果不得覆盖新请求或隐藏新请求的 Loading。

`SceneFlow` 使用 `open(false)`，只替换自身记录的业务场景，不调用 `closeAll()`，从而保留挂载 `Main` 的 `Startup.ls` 生命周期外壳。`autoCloseLoading: false` 时，当前场景只能通过请求绑定的 `completeTransitionLoading()` 请求关闭；框架至少等到 `ready: 100%` 后才执行，旧场景或旧异步任务的调用自动失效。常驻 UI 使用 `retention: "hide"`，普通页面使用 `retention: "destroy"`；二者都由 UI route 明确声明，不通过场景节点存活碰运气。

## UI 生命周期

UI route 声明 `UILayer`、modal、multiplicity 与 retention。`snapshot/listVisible/listManaged/getTop/getBottom/closeTop` 查询全部已管理或可见窗口；最终显示顺序取自 `GRoot` 子节点顺序。modal 同步 `zOrder` 与公开 child-order API，保证遮罩始终紧邻最高可见 modal 下方，含跨层打开和原生 `bringToFront()`。

UI route 还声明 `layout`：非 Popup 层默认 `fullscreen`，Popup 层默认 `center-popup`，也可显式使用 `safe-screen`。`center-popup` 由框架自动播放内容缩放开合动画，全屏布局不播放；关闭/销毁会取消旧 Tween，并以版本令牌隔离晚到回调。`UILayoutService` 只以运行时 `GRoot` 的实际逻辑宽高为布局边界，并把平台窗口坐标转换为 Stage 坐标；项目可自由选择自己的设计分辨率，`.lh` 的创作画布尺寸不是运行时固定边界。完整约定见 [ui-layout.md](ui-layout.md)。

`register(route)` 返回保留参数类型的 route，可用 `show(route, args, { signal })` 获得编译期错参检查；旧字符串入口兼容但不具有同等类型保证。每次 `present` 独占 scope/token，旧代完成不能清理新代。关闭、销毁或外部 signal 取消会结束框架等待并通知 `BindingToken.signal`，`pendingRequests` 区分 loading/binding；不可取消的原生 Loader 单独记录为 `nativeLoads`。取消不会强行终止用户 Promise，异步回写仍必须经 token.commit 或检查失效。

```text
Laya.loader.load(.lh, HIERARCHY)
  -> Prefab.create() returns GWidget
  -> route factory creates BaseGameWindow
  -> BindingToken guards async binding
  -> GWindow.show()
  -> Hide ends presentation; Destroy ends lifetime
```

固定节点、布局和交互组件必须来自 `.ls/.lh`。动态图片直接设置 `GLoader.src`；源码中的 `_loadId` 会拒绝过期结果，清空 `src` 或销毁节点会移除绘制命令的纹理引用。框架不再重复实现动态图片加载器。

`BaseGameWindow.destroy()` 在进入原生 `GWindow.destroy()` 前暂时解除路由 observer，避免 `hideImmediately()` 触发 Hide 后再次进入 Destroy；清理失败会聚合报告，路由可重试仍未销毁的窗口。

原生 destroy 可能先设置 destroyed 再因用户回调抛错，此时 destroyed 不等于完整清理。UI 保留 cleanup-failed 条目和 `cleanupDiagnostics()`，后续 dispose 继续报告，不因第二次调用无事可做就误放行 GC。

公共提示通过 `LX.UI.tip(message)` 进入 `UILayer.Toast`。第一条立即显示，后续按 FIFO 每 500ms 出队；固定 `Tip.lh` 实例由 `PrefabPoolService` 复用，动画直接使用 `Laya.Tween`。回池会停止 Tween、移除父节点并复位文字、透明度、缩放和可见性；UI 停机清队列、Timer、活动实例与晚到 acquire。

## JSON 与 Tables

`LX.Config` 只处理通用 JSON 文档，适用于外部游戏数据、地图/关卡编辑器输出和业务配置。它通过 `ContentCatalog` 的 `data` ID 调用原生 `Loader.JSON`，可在消费边界提供校验器，并支持并发合并、查询、显式释放和晚到结果失效。

`LX.Tables` 只保存 Luban TypeScript-bin 生成的 `Tables`。人工源位于 `Design/Tables`；具体生成位置由下游 `settings/GameProject.json` 指定，模板默认把可调用的表逻辑生成到 `src/game/logic/generated/tables`，数据输出到 `assets/bootstrap/game/tables`。命名游戏需要独立表代码时再显式调整配置。两条数据链没有依赖关系。

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

`AssetImportPolicy.json` 固定 2D 纹理、图集、音频和 Spine 4.2 导入规格。`validate:content-assets` 校验真实 `.meta` 与文件头；它不替代目标设备的压缩纹理、音频解码、Spine 动画和性能验收。详细规则见 [asset-import.md](asset-import.md)。

## 启动与停止

`AppBootstrap` 顺序启动并逆序停止，失败服务自身也参与补偿。`AppServiceContext.signal` 提供协作式取消，stop 必须幂等并可处理半启动状态。默认每个 start 30s、stop 10s，可经 `definition.lifecycle` 配置；这不是整个运行时总耗时上限。超时结束调用方等待但继续记录真实 Promise，晚到 startup 另行补偿。`LX.snapshot()` / `runtime.snapshot()` 聚合启停阶段、pending、失败服务、UI/Pool/Config 和 GC 状态，解绑后用持有的 runtime 查询。

业务服务先停；共享清理先分别使 UI、pool、audio、config 失效，再并行等待原生加载，默认等待最多 5s（必须小于 stop deadline），之后重试 owner 清理。未稳定、异常未恢复或仍有启停操作时明确跳过 GC 并报告失败，不伪称清理成功。旧 runtime 解绑后不可再经 LX 访问；内部 quarantine 阻止在其真实任务/补偿尚未稳定或清理失败时绑定新 runtime，防止旧代晚到误操作新代。clean runtime 不进入 quarantine；仍在收尾的 runtime 以 `25ms..1s` 退避复查，证实清理完成后主动解除强引用，无需等待下一次 bind。不可恢复错误继续 fail-closed，需重建进程/页面，不提供强制 reset 绕过。

## 验证证据

`settings/LayaSourceBaseline.json` 固定官方 `v3.4.1` commit 和 27 个关键 TypeScript 文件的哈希（含 Node、Sprite、统计窗口与 GPU driver）。`npm run check:engine-source` 从本机 CLI 的 `.js.map` 提取完整源码离线比对。

Headless Chromium 真实探针覆盖：JSON 与 Tables、`Laya.timer.clearAll`、GLoader 晚到请求、共享纹理引用、Prefab 池、Tip 队列/动画/复用、UI 跨代绑定/取消/跨层 modal、100 次 UI/Pool owner 计数回归、HTTP 2xx/空响应/二进制/取消，以及 runtime 完整解绑与缓存释放。循环计数不等于长期 heap 泄漏证明，SwiftShader 不等于目标硬件性能。图片/音频/Spine 静态策略另由 `validate:content-assets` 覆盖。

架构门禁使用 TypeScript AST 和 tsconfig 模块解析，覆盖静态、动态、side-effect、export、require 和 alias。类型依赖仍检查分层但不计入运行时环；不可静态定位的动态模块路径明确拒绝。它不是任意 eval/运行时元编程的安全沙箱。
