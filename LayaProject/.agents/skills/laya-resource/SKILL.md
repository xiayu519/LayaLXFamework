---
name: laya-resource
description: 实现或诊断 Laya.loader 加载、缓存、动态纹理、层级依赖、资源释放时序与 CPU/GPU 内存时使用；.ls/.lh 序列化和小游戏分包配置不触发。
---

# Laya Resource

1. 先读 [references/lifecycle.md](references/lifecycle.md)；若结论依赖引擎实现，运行 `npm run check:engine-source`。
2. 加载直接使用 `Laya.loader`；`LX.Res` 与其为同一实例。`ContentCatalog` 只提供 ID 到 URL 映射。
3. 层级资源默认不传 `group`。只有依赖闭包完全独立、明确需要整包强制清理且有专项验证时才使用 Laya group。
4. 回收先失效异步任务并销毁显示节点/组件，再等待加载与渲染提交稳定，最后在功能切换或停机边界调用 `Laya.Scene.gc()`。
5. 禁止调用 `_addReference/_removeReference/_clearReference`。动态 UI 图片直接使用 `GLoader.src`，换图或结束时清空 `src`/销毁 owner。
6. 运行 `npm run typecheck && npm test && npm run check:architecture`；涉及真实缓存与释放再运行 `npm run test:headless`。
