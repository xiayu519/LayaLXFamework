---
name: laya-ui2
description: 按示意图制作窗口、选择全屏或弹窗骨架与 GList 功能模板，或修改 LayaAir ui2 分层、动画、路由和绑定生命周期时使用；普通 Scene 与非 UI 资源不触发。
---

# Laya ui2

1. 制作或重组窗口先读 [references/window-workflow.md](references/window-workflow.md)：判定窗口类型 → 选择分层骨架 → 组合功能模板 → 按散图拼装 → 绑定 → 验收。类型明确不重复询问；无法从上下文确定全屏/弹窗时先询问，不能按“背包/商城”等功能名称猜定。
2. 所有窗口统一使用全屏 Root，下设可选背景 `full` 和 `safeContent`；安全区内可选 `top/full/mid/bottom`。全屏列表等拉伸内容放 safeContent/full，填满上下栏之间的空间，保持行高和字号；固定居中内容才用 mid，空槽位省略或高度为 0。弹窗全部内容归 mid，只动画 mid。复用原生 GRoot.modalLayer，弹窗默认 modal:true、closeOnMaskClick:true；关闭后扩展覆写 onClosed()。骨架、功能与视觉组件分开检索，见 [模板索引](../../../docs/ui-templates.md)。
3. 读 [references/lifecycle.md](references/lifecycle.md)。固定节点在 `.lh/.ls` 声明，route 声明 layout 等现有配置；加载使用 `Laya.loader`，显示顺序以 `GRoot` 为准。
4. singleton 可 Hide 或 Destroy；multiple 只允许 Destroy。窗口长期副作用归 `lifetime`，每次展示副作用归 `presentation`。异步回写经 `BindingToken.commit()`，动态图使用 `GLoader.src`，关闭时清理。
5. 瞬时公共提示调用 `LX.UI.tip()`，不建业务队列、Tween 或池副本。
6. 验收同时覆盖类型选择、源节点归属、mid 动画与多分辨率交互，不能用居中或点击成功替代分层验收。修改 `.lh` 运行 `npm run validate:assets:laya`；真实 ui2 行为按 [Headless 范围](../laya-headless/references/verification.md) 选专项 probe 或 `framework` 组。
