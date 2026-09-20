---
name: laya-runtime-lifecycle
description: 处理 Event、Laya.timer、Tween、通用异步回写、句柄和服务启停的 owner 清理时使用；ui2 窗口实例与 session 展示绑定自身生命周期不触发。
---

# Runtime Lifecycle

1. Event、Timer、Tween 直接使用 Laya 原生对象；Timer 使用 engine-owned `Laya.timer`，不要 `new Laya.Timer()` 或创建同义管理器。
2. 单类副作用优先用 `offAllCaller`、`clearAll`、`Tween.killAll` 等 owner API。只有同一 owner 需要聚合多种清理动作时才使用 `LifetimeScope`。
3. 事件源与订阅寿命分别按 [归属判定](../../../docs/ownership-decisions.md) 判断。World 用 world.listen 精确卸载自己的订阅；场景 UI 展示用 session.bindData/session.lifetime，应用窗口用已有展示绑定。Hide 结束展示，Destroy 结束实例；表现异步回写检查 token。
4. 清理逆序、幂等且聚合错误；服务交给 `AppBootstrap` 顺序启动、逆序停止。业务服务停止后才销毁共享 UI/池并执行资源 GC。
5. 按本次改变的失败边界选择重复停止、部分失败、Hide/Destroy 重入、Timer 清理或晚到回调验证；不强制新增整套测试，相关输入未变时沿用已有证据。
