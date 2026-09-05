---
type: feedback
scope: collaboration
description: 旧条目误把约 2–3 人使用理解为框架维护与 Codex 任务均需多人协作，已由单维护者协作策略替代。
trigger: 业务实现中拟修改 framework、公共契约、Codex 工作流，或检测到其他成员同时修改目标文件时。
status: superseded
last_verified: 2026-09-05
source: user-confirmed
---

# Small-team collaboration

> 已由 [Single-maintainer collaboration](single-maintainer-collaboration.md) 替代。本条保留用于追溯旧解释，不再指导任务委派。

## Required behavior

- 写入前复查目标文件并保留其他成员改动；同一语义区域出现冲突时停止报告，不猜测覆盖。
- 公共化前检查真实消费者、稳定语义、Laya 原生能力、生命周期/失败边界与验证方式。
- 不能证明公共性则保留在 `src/game/`；能证明时先提交 Change Contract，批准后才修改 `src/framework/` 或共享工作流。
- 开发者纠正立即用于当前任务，验证后只沉淀有证据且未来可复用的内容。

## Evidence

当时把“使用时约 2–3 人协作”误解为框架由多人维护，并进一步影响了 Codex 委派策略。开发者已明确纠正：框架由一人维护，使用团队规模不等于每个任务的代理数量。
