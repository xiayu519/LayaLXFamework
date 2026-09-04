---
name: laya-spine
description: 接入或诊断 LayaAir 3.4.1 Spine 动画、Spine2DRenderNode、播放句柄与资源释放时使用；普通 Sprite 动画和 UI 路由不触发。
---

# Laya Spine

1. 以项目 `engine/types/LayaAir.d.ts` 和 `SpineService` 为准，确认发布设置启用 `laya.spine`。
2. 使用 `Sprite + Spine2DRenderNode`，禁止旧 `SpineSkeleton`；由句柄同时拥有 Sprite、渲染节点和资源 lease。
3. 明确动画名、循环、轨道、皮肤与快渲染/缓存策略；销毁顺序为停止播放、销毁显示对象、释放 lease、无引用后清 group。
4. 补创建/销毁/加载失败测试；发布包必须含 `laya.spine.js`。真实骨骼效果或设备性能需要代表性 Spine 资产专项验证。
