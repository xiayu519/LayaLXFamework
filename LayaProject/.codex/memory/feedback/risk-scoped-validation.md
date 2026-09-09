---
type: feedback
scope: validation
description: 验证按改动影响选择最小充分范围，避免文档或局部任务附带全量检查；引擎验收仍须原地 Headless。
trigger: 选择验收命令、复用构建、排查过量验证或审查验证成本时
status: active
last_verified: 2026-09-08
source: user-confirmed
---

# Risk-scoped validation

## Confirmed preference

开发者要求修复小改动触发全量验证造成的时间与额度浪费，不能只避免重复构建而保留过粗的验证选择。

## Current guidance

当前选择规则在 [AGENTS.md](../../../AGENTS.md)；探针分组与构建复用在 [Headless verification](../../../.agents/skills/laya-headless/references/verification.md)。这条反馈保留纠正原因，不附加验证命令。

## Evidence

用户明确要求“优化并验证”；定向测试、独立文档执行、模型范围选择与真实引擎正反例记录在 [验收报告](../../../docs/verification-scope-validation.md)。
