---
name: laya-prefab-pool
description: 实现或诊断 Laya Prefab 实例池、Laya.Pool 复用、借出归还、容量、重置、排空和晚到加载时使用；UI 窗口栈与普通资源加载不触发。
---

# Laya Prefab Pool

1. 使用 `PrefabPoolService` 增加异步 Prefab 创建、`maxActive/maxIdle`、节点所有权与 reset；idle 存储必须使用 `Laya.Pool`。
2. 每个 service/pool 使用唯一 sign，禁止不同 runtime 或 pool 串池。并发 acquire 共用同一 Loader 请求，并把 pending 计入容量。
3. release 顺序：验证所有权 → `removeSelf()` → `onRelease` → inactive → recover；超出 idle 上限或 reset 失败则 destroy。
4. drain 有 active/pending 时拒绝；无持有者时销毁全部 idle 节点并 `clearBySign`。停机先 dispose，再等待晚到 load，最后在统一边界 `Laya.Scene.gc()`。
5. 不保存资源 lease，不默认使用 Loader group。补复用、容量、重复/跨池归还、reset 失败、排空和 dispose-race 测试。
