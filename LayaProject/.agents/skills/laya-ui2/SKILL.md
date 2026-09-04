---
name: laya-ui2
description: 创建或修改 LayaAir ui2 的 .lh 界面、GWindow/GRoot、UIRouter 路由、层级、弹窗和异步 UI 绑定生命周期时使用；普通场景与非 UI 资源不触发。
---

# Laya ui2

1. 先读 [lifecycle.md](references/lifecycle.md)，并以 `engine/types/LayaAir.d.ts` 和项目现有 UI 代码为 API 依据。
2. 固定节点、布局、渲染和交互组件写入 `.lh`；运行时代码只绑定业务状态与事件。
3. 通过 `LX.UI` / `UIRouter` 注册和展示窗口，复用 ui2 的 `GWindow`、`GRoot` 与生命周期，不建立第二套窗口栈。
4. 每次异步展示绑定使用新的 `BindingToken`；Hide、Destroy 或新一轮展示必须使旧结果失效。
5. 修改 `.lh` 后运行 `npm run validate:assets`；交付前运行 `npm run test:headless`。
