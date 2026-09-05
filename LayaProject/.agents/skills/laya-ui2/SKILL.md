---
name: laya-ui2
description: 创建或修改 LayaAir ui2 的 .lh 界面、GWindow/GRoot、UIRouter、层级、弹窗和异步绑定生命周期时使用；普通 Scene 与非 UI 资源不触发。
---

# Laya ui2

1. 先读 [references/lifecycle.md](references/lifecycle.md)。固定节点、布局、关系和交互组件必须在 `.lh/.ls` 中声明。
2. route 只声明 ID、URL、layer、modal、multiplicity、retention 与 factory；加载使用 `Laya.loader`，最终显示顺序以 `GRoot` 为准。
3. singleton 可 Hide 或 Destroy；multiple 只允许 Destroy。窗口长期副作用归 `lifetime`，每次展示副作用归 `presentation`。
4. 异步绑定必须用 `BindingToken.commit()`；动态图片直接使用 `GLoader.src`，换图/Hide/Destroy 时清空或销毁 owner。
5. 瞬时公共提示调用 `LX.UI.tip()`；Tip 固定在 Toast 层，队列、Tween 和回池状态由框架管理，不建业务副本。
6. 修改源资产运行 `npm run validate:assets`；修改窗口行为运行 `npm run typecheck && npm test && npm run test:headless`。
