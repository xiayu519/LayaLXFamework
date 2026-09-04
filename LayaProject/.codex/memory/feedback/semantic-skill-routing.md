---
type: feedback
scope: codex-workflow
description: 业务请求必须按自然语言语义隐式触发范围最窄的 Skill，不在 AGENTS.md 写死 Skill 路由。
trigger: 新增、拆分、修改或评审 AGENTS.md、Skill description 与工作流提示时。
status: active
last_verified: 2026-09-04
source: user-confirmed
---

# Semantic Skill routing

## Required behavior

- `AGENTS.md` 只说明业务如何向 Codex 提供目标、验收和约束，以及跨任务稳定行为。
- 每个 Skill 处理一个清晰语义边界，主要触发场景写在 `description` 开头。
- 不要求业务输入显式 Skill 名称，不在默认提示或 `AGENTS.md` 写名称到任务的映射。
- 用动态结构检查与代表性语义 eval 防止遗漏、误触发和描述预算膨胀。

## Evidence

开发者在本项目工作流重构批准前明确要求。
