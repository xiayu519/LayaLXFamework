---
name: laya-scene
description: 实现或诊断 Laya Scene 加载、打开、关闭、销毁、切换竞态与场景级回收时使用；ui2 窗口路由不触发。
---

# Laya Scene

1. 直接使用 `Laya.Scene`；`LX.Scene` 是同一类。加载层级资源使用 `Laya.loader.load(url, { type: Laya.Loader.HIERARCHY })`，打开/关闭使用 Scene 公共 API。
2. 明确 `close` 与 `destroy`：移除的 Scene 不会自动销毁；需要自动销毁时设置 `autoDestroyAtClosed`，否则在 owner 边界显式 `destroy()`。
3. 连续导航确有晚到覆盖风险时，在 `src/game/application/` 为该业务流增加单调 request version；过期实例立即销毁。不要预设公共 `SceneRouter`。
4. 场景节点全部销毁、异步加载稳定后再调用 `Laya.Scene.gc()`；不向层级加载默认附加资源 group。
5. 补快速切换、晚到结果、重复关闭和销毁测试，并运行 `npm run typecheck && npm test && npm run test:headless`。
