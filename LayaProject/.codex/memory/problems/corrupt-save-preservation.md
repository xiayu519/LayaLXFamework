---
type: problem
scope: framework-storage
description: 损坏存档若直接持久化默认值会抹掉诊断与恢复依据；默认恢复必须可观察且保留原始值。
trigger: 修改 SaveStore 解析、校验、迁移、恢复或未来版本处理时
status: active
last_verified: 2026-09-04
source: code-verified
---

# Corrupt save preservation

## Failure

旧实现遇到非法 JSON、非法 envelope、缺失迁移或迁移后数据无效时，会立即把默认值写回同一个 key，永久覆盖原始存档。

## Guard

只有 key 不存在时自动持久化默认值。损坏或迁移失败时返回 `source=default` 和具体 `recovery`，但不写回；未来版本抛出 `UnsupportedSaveVersionError`。默认值本身也必须通过 schema 校验。

## Evidence

`tests/SaveStore.test.ts` 覆盖缺失、损坏、迁移成功、迁移缺失/抛错、非法默认值和未来版本保留。
