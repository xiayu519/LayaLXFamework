# LXFamework Runtime Guide

业务通过 `LX` 使用运行时：`LX.Res` 是 `Laya.loader`，`LX.Scene` 是 `Laya.Scene`；Event、`Laya.timer`、Tween、LocalStorage、SoundManager 与 Spine 组件直接遵循 LayaAir 3.4.1 API。

UI 使用 `.lh` + `UIRouter`。route 提供 ID、URL、层级、modal、multiplicity、retention 与窗口 factory；`BaseGameWindow` 将长生命周期清理与每次展示清理分开，异步绑定使用 `BindingToken`。动态图片直接设置 `GLoader.src`，换图或关闭时清空 `src`/销毁窗口。

Prefab 实例复用使用 `LX.Pool`：注册 URL、`maxIdle/maxActive` 与 acquire/release reset 钩子。池内部使用 `Laya.Pool`，排空会销毁 idle 节点；功能退出后待加载和渲染状态稳定，再调用 `Laya.Scene.gc()`。

Spine 放在对应 UI、场景或 Prefab 的 `.lh` 中，通过 `Spine2DRenderNode.source` 配置；需要高频复用时将整个 Prefab 交给 `LX.Pool`。音频通过 `LX.Audio` 管理 BGM/SFX handle 与 owner，底层仍是 `SoundManager`。

资源默认不使用 Loader group。层级加载会把 group 传播给全部依赖，而 `clearResByGroup()` 是强制清理；共享依赖存在时应依靠节点/组件引用和稳定边界的 `Scene.gc()`。

完整原地 Headless 验收运行 `npm run verify`。引擎源码一致性单独运行 `npm run check:engine-source`。
