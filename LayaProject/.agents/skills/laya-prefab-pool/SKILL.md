---
name: laya-prefab-pool
description: 实现或诊断 Laya Prefab 实例池、借出归还、容量、重置、排空和池持有资源时使用；UI 窗口栈与普通资源加载不触发。
---

# Laya Prefab Pool

1. 先检查 `PrefabPoolService`、对象的 Laya 类型和使用方生命周期。
2. 每个定义声明 URL、group、`maxActive`、`maxIdle`，以及必要的 acquire/release 重置；池只保存空闲实例，活跃实例由调用方负责归还。
3. 拒绝外来对象、重复归还、超出活跃容量和重复定义；销毁时先拒绝新借出，再处理活跃实例，最后释放池持有的 group lease。
4. 测试并发首载、复用重置、容量、外来/重复归还和 drain；再运行类型与架构检查。动态 Prefab 的发布收集另走资产与 Headless 验证。
