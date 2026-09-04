---
type: decision
scope: codex-workflow
description: 主线程和任务门禁固定使用 gpt-5.6-sol/high，已确认的低风险小任务可由 gpt-5.6-terra/medium 执行。
trigger: 修改 .codex 配置、执行模型分层、评估 token 与质量取舍或运行工作流评测时。
status: active
last_verified: 2026-09-04
source: user-confirmed
---

# Codex model floor

## Decision

`.codex/config.toml` 固定主线程为 `gpt-5.6-sol/high`；Plan mode 使用 `xhigh`，输出详细度保持 `low`。通过门禁且边界明确、低风险、局部、可直接验收的小任务，可以语义触发独立执行 Skill，并交给 `gpt-5.6-terra/medium` 子代理。

## Consequence

复杂判断、共享改动和最终验收仍由主线程负责。极小任务若不足以抵消委派开销，则由主线程直接完成，避免子代理增加总 token 与等待时间。

## Re-evaluate when

开发者明确调整模型下限，或当前模型/配置字段发生官方变更。
