---
name: laya-runtime-lifecycle
description: 处理监听、Timer、Tween、异步回写、句柄和服务启停的统一清理所有权时使用；单纯资源分组与纯状态机不触发。
---

# Runtime Lifecycle

1. 为持有副作用的对象确定 owner，并使用 `LifetimeScope`；每个注册动作紧邻登记反向清理。
2. 窗口长期依赖归 lifetime，每次展示的监听、Timer、Tween、动态资源归 presentation；Hide 结束 presentation，Destroy 再结束 lifetime。
3. 清理按登记反序执行且幂等；即使一项失败也继续清理，最终聚合报告。异步操作必须在回写前检查 token/owner 是否仍有效。
4. 服务由 `AppBootstrap` 正序启动、逆序停止；业务服务停止后才统一清共享运行时资源。补重复停止、部分失败和晚到回调测试。
