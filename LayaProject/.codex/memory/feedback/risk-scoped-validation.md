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

## Required behavior

- 依据实际影响选最小充分验收，不以文件数或“保险”为理由扩大。复用现有测试与探针；共享依赖和高风险边界仍需充分覆盖。当前选择规则在根 `AGENTS.md` 与相关 Skill，不在记忆复制命令清单。
- 本轮已通过检查仅在相关输入、依赖、配置变化或新失败时重跑；组合命令已包含的检查不预跑。构建复用必须有本轮成功证据且发布输入未变。
- 延续原地要求：固定 LayaAir 3.4.1 CLI、Headless Chromium/CDP；不复制项目，不以 mock 代替真实引擎。仅明确要求时使用 GUI；平台或商店行为缺少对应环境证据时报告未验证。

## Evidence

用户明确要求“优化并验证”；定向测试、独立文档执行、模型范围选择与真实引擎正反例记录在 [验收报告](../../../docs/verification-scope-validation.md)。此前反馈保留于 [旧记录](in-place-headless-validation.md)。
