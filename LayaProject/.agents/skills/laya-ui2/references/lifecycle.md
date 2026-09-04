# ui2 lifecycle

- 项目固定 `laya.ui = ui2`，不启用 `laya.d3`。
- `.lh` 使用 `Laya.loader.load(url, { type: Laya.Loader.HIERARCHY, group })` 加载为 `Prefab`；`Prefab.create()` 根节点必须符合 route 预期。
- 业务通过 `LX.UI.show/close` 进入已注册 route；窗口复用 `GWindow` / `GRoot` 的 show、hide、modal 和层级能力。
- singleton route 可 Hide 复用；multiple 或重资源窗口通常 Destroy。策略在 route 注册处声明。
- 每次 `present` 取得新 `BindingToken`；Hide、Destroy 或新的 present 使旧 token 失效。异步结果只在 `token.commit(...)` 成功时写 UI。
- 固定节点、关系、布局、背景、文本与交互组件必须位于 `.lh`，运行时代码仅做数据绑定和动态列表内容。
- route 明确 `UILayer`、modal、singleton/multiple 与 hide/destroy；查询使用 `listVisible/listManaged/getTop/getBottom/snapshot`，真实顺序仍以 `GRoot` 子节点为准。
- 原生调用 `GWindow.hide/destroy` 也必须回传路由并同步释放所有权；`loading`、visible、hidden-retained 与 Loader cache 是不同状态。
- 动态图片使用 `DynamicTextureBinding`，归属 presentation 或 lifetime scope；新请求、Hide、Destroy 会阻止旧纹理回写并释放 group lease。
