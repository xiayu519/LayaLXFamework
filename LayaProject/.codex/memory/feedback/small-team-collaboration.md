---
type: feedback
scope: collaboration
description: 项目按 2–3 人协作处理；业务中途出现公共化候选或同一区域并行修改时必须停止相应边界并判断。
trigger: 业务实现中拟修改 framework、公共契约、Codex 工作流，或检测到其他成员同时修改目标文件时。
status: active
last_verified: 2026-09-04
source: user-confirmed
---

# Small-team collaboration

## Required behavior

- 写入前复查目标文件并保留其他成员改动；同一语义区域出现冲突时停止报告，不猜测覆盖。
- 公共化前检查真实消费者、稳定语义、Laya 原生能力、生命周期/失败边界与验证方式。
- 不能证明公共性则保留在 `src/game/`；能证明时先提交 Change Contract，批准后才修改 `src/framework/` 或共享工作流。
- 开发者纠正立即用于当前任务，验证后只沉淀有证据且未来可复用的内容。

## Evidence

开发者明确纠正项目不是单人框架，而是可能由 2–3 人同时协作。
