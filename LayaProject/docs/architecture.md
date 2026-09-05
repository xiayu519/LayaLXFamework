# Architecture

## 基线

项目固定使用 LayaAir `3.4.1`、2D、`laya.ui = ui2`，不启用 `laya.d3`。设计顺序是：先确认 Laya 官方源码与公开 API，再添加有明确业务语义、失败边界和验证方式的薄扩展。

`src/framework/` 是 2–3 人共享层，不依赖 `src/game/`；`src/game/logic/` 是当前产品必须保留的真实业务根。`src/Main.ts` 是稳定生命周期外壳，只调用下游所有的 `src/game/bootstrap/createApplication.ts`。该桥接入口默认委托给 `src/game/logic/bootstrap/createGameApplication.ts`，后者通过 `createRuntime(definition, adapters)` 显式组装，不使用 DI 容器。

## Laya 原生边界

| 领域 | 直接使用 | 项目扩展 |
| --- | --- | --- |
| 事件/时间/动画 | Event、`Laya.timer`、Tween | `LifetimeScope` 仅聚合异构清理；不建立新 Timer |
| 资源 | `Laya.loader`、Resource 引用计数、`Scene.gc()` | `ContentCatalog` 映射 ID/URL；`LX.Config` 增加 JSON 校验和显式释放 |
| 场景 | `Laya.Scene.open/close/destroy/gc` | 真实业务有竞态时在 game 层增加请求版本，不设公共 SceneRouter |
| UI | ui2 `GRoot/GWindow/GWidget/GLoader` | 路由、分层查询、窗口参数与生命周期约束 |
| 对象池 | `Laya.Pool` | Prefab 异步创建、容量、所有权和 reset 钩子 |
| 音频 | `SoundManager` / `AudioDataCache` | BGM/SFX、handle、owner 与用户设置 |
| Spine | `.lh` + `Spine2DRenderNode.source` | 复用时走通用 Prefab 池，不设 SpineService |
| 存储/网络 | LocalStorage、HttpRequest | schema 迁移与稳定错误契约 |
| 配表 | `Loader.BUFFER` | Luban 生成的业务 Tables 安装到 `LX.Tables` |

`LX.Res` 返回准确的 `Laya.loader`，`LX.Scene` 返回准确的 `Laya.Scene`。`LX` 不暴露整个 runtime，也不提供 `LX.Spine` 之类的平行入口。

## UI 生命周期

UI route 声明 `UILayer`、modal、multiplicity 与 retention。`snapshot/listVisible/listManaged/getTop/getBottom/closeTop` 查询全部已管理或可见窗口；最终显示顺序取自 `GRoot` 子节点顺序。modal 同步 `zOrder` 与公开 child-order API，保证遮罩始终紧邻最高可见 modal 下方，含跨层打开和原生 `bringToFront()`。

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

`LX.Tables` 只保存 Luban TypeScript-bin 生成的 `Tables`。人工源位于 `Design/Tables`；具体生成位置由下游 `settings/GameProject.json` 指定，当前默认业务根为 `src/game/logic/generated/tables`，数据输出到 `assets/bootstrap/game/tables`。两条数据链没有依赖关系。

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
