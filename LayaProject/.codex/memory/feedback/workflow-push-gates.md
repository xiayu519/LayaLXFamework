---
type: feedback
scope: codex-workflow
description: 语义输入改动推送前运行一次本地 Codex CLI 回归；普通工作流改动只跑确定性门禁，GitHub CI 不调用模型。
trigger: 修改 AGENTS、Skill description、路由样例、决策语义或其评测策略时。
status: superseded
last_verified: 2026-09-05
source: user-confirmed
---

# Workflow push gates

Superseded by [Local validation and GitHub sync-only contract](../decisions/local-validation-github-sync-only.md).

## Confirmed preference

语义输入改动不能在只通过通用 `npm run verify` 后直接推送；普通 YAML、脚本、测试实现和文档改动不得因此调用模型。该边界由 [Validation profiles](../decisions/validation-profiles.md) 进一步收窄。

## Required behavior

- 工作流改动先运行 `npm run check:skills`、`npm run check:memory`、`npm run validate:game-workflow` 和 `npm run test:workflow`。
- 只有 AGENTS、Skill description、路由样例或决策语义变化时，才追加一次 `npm run test:skill-routing`。
- 语义评测复用开发者已经登录的本地 Codex CLI，不把模型调用搬到 GitHub Actions。
- GitHub CI 只运行无需密钥的确定性检查，不要求 `CODEX_API_KEY`。
- 相关门禁未通过时不推送，不把未运行项报告为已验收。

## Evidence

commit `7a16edc` 推送前只运行通用 verify，未运行本地语义路由评测；推送后，不需要的 API-backed `semantic-evaluation` 又因缺少 `CODEX_API_KEY` 在执行项目评测前失败。开发者明确纠正：该仓库使用本地 Codex CLI，不需要 API key 功能。
