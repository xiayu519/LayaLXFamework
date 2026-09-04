---
name: laya-runtime-lifecycle
description: 处理 Event、Laya.timer、Tween、异步回写、句柄和服务启停的 owner 清理时使用；单纯资源加载与纯状态机不触发。
---

# Runtime Lifecycle

1. Event、Timer、Tween 直接使用 Laya 原生对象；Timer 使用 engine-owned `Laya.timer`，不要 `new Laya.Timer()` 或创建同义管理器。
2. 单类副作用优先用 `offAllCaller`、`clearAll`、`Tween.killAll` 等 owner API。只有同一 owner 需要聚合多种清理动作时才使用 `LifetimeScope`。
3. 窗口长期副作用归 `lifetime`，每次展示归 `presentation`；Hide 清 presentation，Destroy 再清 lifetime。异步回写先检查 token。
4. 清理逆序、幂等且聚合错误；服务交给 `AppBootstrap` 顺序启动、逆序停止。业务服务停止后才销毁共享 UI/池并执行资源 GC。
5. 补重复停止、部分失败、Hide/Destroy 重入、Timer clearAll 和晚到回调测试。
