# Architecture

## 基线

项目固定使用 LayaAir `3.4.1`、2D、`laya.ui = ui2`，不启用 `laya.d3`。设计顺序是：先确认 Laya 官方源码与公开 API，再添加有明确业务语义、失败边界和验证方式的薄扩展。

`src/framework/` 是 2–3 人共享层，不依赖 `src/game/`；`src/game/` 保存具体产品业务。`src/game/bootstrap/createApplication.ts` 负责显式组装，不使用 DI 容器。`src/Main.ts` 只进入 game bootstrap 并通过 `LX` 访问已组装服务。

## Laya 原生边界

| 领域 | 直接使用 | 项目扩展 |
| --- | --- | --- |
| 事件/时间/动画 | Event、`Laya.timer`、Tween | `LifetimeScope` 仅聚合异构清理；不建立新 Timer |
| 资源 | `Laya.loader`、Resource 引用计数、`Scene.gc()` | `ContentCatalog` 只映射 ID/URL |
| 场景 | `Laya.Scene.open/close/destroy/gc` | 真实业务有竞态时在 game 层增加请求版本，不设公共 SceneRouter |
| UI | ui2 `GRoot/GWindow/GWidget/GLoader` | 路由、分层查询、窗口参数与生命周期约束 |
| 对象池 | `Laya.Pool` | Prefab 异步创建、容量、所有权和 reset 钩子 |
| 音频 | `SoundManager` / `AudioDataCache` | BGM/SFX、handle、owner 与用户设置 |
| Spine | `.lh` + `Spine2DRenderNode.source` | 复用时走通用 Prefab 池，不设 SpineService |
| 存储/网络 | LocalStorage、HttpRequest | schema 迁移与稳定错误契约 |

`LX.Res` 返回准确的 `Laya.loader`，`LX.Scene` 返回准确的 `Laya.Scene`。`LX` 不暴露整个 runtime，也不提供 `LX.Spine` 之类的平行入口。

## UI 生命周期

UI route 声明 `UILayer`、modal、multiplicity 与 retention。`snapshot/listVisible/listManaged/getTop/getBottom/closeTop` 查询全部已管理或可见窗口；最终显示顺序取自 `GRoot` 子节点顺序。modal 遮罩的 `zOrder` 与最高可见 modal route 同步。

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

## 资源与释放

默认层级资源加载不传 `group`。LayaAir 3.4.1 的 `HierarchyLoader` 会把 load options 传播给依赖，而 `clearResByGroup()` 会强制销毁组内缓存且不会移除 `groupMap` 成员；把共享纹理纳入功能 group 会产生跨所有者误卸载风险。只有依赖闭包完全独立且确实需要显式整包卸载时，业务才可直接使用 Laya group，并承担完整所有权证明与专项测试。

正常释放顺序：使异步回写失效，解除 Event/Timer/Tween，销毁窗口、场景或池中节点，等待加载和渲染提交稳定，再在功能切换或停机边界调用 `Laya.Scene.gc()`。显示命令和 `Spine2DRenderNode` 会维护 Resource 引用；业务禁止调用 `_addReference/_removeReference/_clearReference`。

`PrefabPoolService` 只缓存实例，不私自持有 Prefab resource lease。归还时先脱离父节点、执行 reset，再交给唯一签名的 `Laya.Pool`；超出 `maxIdle` 直接销毁。排空会销毁所有 idle 节点，运行时停机等待晚到加载后再执行 `Scene.gc()`。

`SoundManager` 的解码缓存由 `AudioDataCache` 管理，不属于普通 Loader group。`AudioService` 只增加业务声道语义，不宣称统一卸载音频缓存。

## 存档与网络失败边界

`SaveStore` 只在键不存在时持久化默认值。损坏 JSON、非法 envelope、缺失/失败迁移和非法数据返回带 `recovery` 原因的默认值，但保留原始存档；未来版本继续抛出 `UnsupportedSaveVersionError`，禁止降级覆盖。

`HttpTransportError` 提供 `kind/status/retryable/attempt/maxAttempts`。默认不重试；GET/HEAD 或带显式 `idempotencyKey` 的 POST 才能启用最多 5 次尝试，并只重试网络、超时和配置的瞬时 HTTP 状态。取消、参数、初始化和同步派发错误不重试。

## 内容资产门禁

`AssetImportPolicy.json` 固定 2D 纹理、图集、音频和 Spine 4.2 导入规格。`validate:content-assets` 校验真实 `.meta` 与文件头；它不替代目标设备的压缩纹理、音频解码、Spine 动画和性能验收。详细规则见 [asset-import.md](asset-import.md)。

## 启动与停止

`AppBootstrap` 顺序启动并逆序停止。业务服务先停；共享清理依次处理 UI（含晚到加载重试）、Prefab pool（含晚到加载重试）、Audio，最后执行 `Laya.Scene.gc()`。每一步独立执行并汇总错误。

## 验证证据

`settings/LayaSourceBaseline.json` 固定官方 `v3.4.1` commit 和 22 个关键 TypeScript 文件的哈希。`npm run check:engine-source` 从本机 CLI 的 `.js.map` 提取完整源码离线比对。

Headless Chromium 真实探针覆盖：`Laya.timer.clearAll`、`GLoader` 晚到请求、共享纹理双持有者引用、Prefab 池复用/排空、UI modal 层与 Destroy 重入、Startup Scene 销毁触发 runtime 停机。图片/音频/Spine 静态策略另由 `validate:content-assets` 覆盖；代表性 Spine 动画、真实音频解码、纹理压缩与目标机性能必须在业务提供对应资产后另做专项验收。
