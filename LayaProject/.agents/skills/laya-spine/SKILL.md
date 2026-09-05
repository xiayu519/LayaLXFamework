---
name: laya-spine
description: 导出、导入或诊断 LayaAir 3.4.1 Spine 版本、.skel/.atlas、页纹理、Spine2DRenderNode、播放、池化与释放时使用；普通 Sprite 动画不触发。
---

# Laya Spine

1. 涉及 Spine 导出或导入时先读 [export-profile.md](references/export-profile.md)；确认 `laya.spine` 模块与 `laya.spine.js` 已启用，运行时类型使用 `Spine2DRenderNode`，禁止旧 `SpineSkeleton`。
2. 在 `.lh` 的 Sprite 上挂 `Spine2DRenderNode` 并设置 `source`。引擎在 init/reset/disable/destroy 中维护 `SpineTemplet` 引用，业务不得手动改私有引用计数。
3. 播放控制直接使用组件公开 API；高频实例复用整个 `.lh` Prefab，并交给 `PrefabPoolService` 的 acquire/release reset。
4. 结束时先停止播放并销毁/归还 owner；全部相关节点和加载稳定后，由功能边界调用 `Laya.Scene.gc()`。
5. 修改 `.lh` 资产运行 `npm run validate:assets:laya && npm run validate:content-assets`；其他 Spine 内容资产运行 `npm run validate:assets && npm run validate:content-assets`。没有代表性 Spine 资产时只报告模块/发布链路验证，不宣称动画效果、内存或 DrawCall 已通过。
