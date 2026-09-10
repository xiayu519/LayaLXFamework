---
name: laya-scene
description: 实现或诊断 Laya Scene 加载、打开、关闭、销毁、切换竞态与场景级回收时使用；ui2 窗口路由不触发。
---

# Laya Scene

1. 原生独立场景直接使用 `Laya.Scene`。加载层级资源使用 `Laya.loader.load(url, { type: Laya.Loader.HIERARCHY })`，打开/关闭使用 Scene 公共 API。
2. 明确 `close` 与 `destroy`：移除的 Scene 不会自动销毁；需要自动销毁时设置 `autoDestroyAtClosed`，否则在 owner 边界显式 `destroy()`。
3. 业务场景使用 `lx.scenes` 按 route 注册、打开、get 和卸载；不同 route 可并存，同 route 内部复用 SceneFlow 与 BaseGameScene 的失效、Loading、失败保护和清理，见 [场景流程](../../../docs/scene-flow.md)；World 只注册定义并保存卸载回调，Scene 实例归 SceneRegistry、UI 归 Scene；不新增 world.ui 或全局 current 猜测。原生独立 Scene 操作不强制经过切换事务。
4. 需要 UI 的场景在 `.ls` 声明直接子节点 `uiRoot: GWidget`，通过 `this.ui` 使用场景归属。场景的页面、HUD 和弹窗均为原生 GWidget Runtime，挂 uiRoot；应用 lx.ui 的 GWindow 才挂 GRoot。owner、host、layout 独立，session.show 的子窗口归父展示，session.ui.show 的独立窗口归场景；离场销毁可见、隐藏缓存和待加载，不能只关闭可见窗口。应用由原生 main() 启动、lx.stop() 停机，不绑定 Startup Scene 寿命。
5. 先使场景 UI 和异步失效，停止副作用并销毁 owner，等待原生加载稳定后再调用 `Laya.Scene.gc()`。`describeResources()` 是加载需求，不是独占卸载清单；不默认附加资源 group。
6. 按改动验证快速切换、晚到结果、隐藏 UI 缓存、重复关闭或销毁；Scene 引擎行为按 [Headless 范围](../laya-headless/references/verification.md) 用专项 probe 验收，共享停机变化再扩大覆盖。
