---
name: client-storage
description: 设计或修改 SaveStore、Laya LocalStorage、存档 schema、版本迁移、校验、损坏恢复和未来版本保护时使用；运行时资源缓存不触发。
---

# Client Storage

1. domain/application 只依赖存档契约；`Laya.LocalStorage` 访问保留在 infrastructure。
2. schema 具有显式版本；读取依次执行解析、结构校验和逐版本迁移，迁移结果再次校验后才能写回。
3. 未来版本必须拒绝降级覆盖；损坏数据的备份、清除或默认值策略要成为可观察结果。
4. 序列化需稳定且只包含持久状态；临时缓存、引擎对象和平台句柄不得进入存档。
5. 为缺失、损坏、旧版、未来版、重复迁移和写入失败补测试；schema 语义变化按批准的 Change Contract 执行。
