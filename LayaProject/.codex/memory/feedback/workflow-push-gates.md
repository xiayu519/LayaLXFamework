---
type: feedback
scope: codex-workflow
description: 工作流改动推送前必须运行本地 Codex CLI 语义回归；GitHub CI 不得要求 CODEX_API_KEY 或调用模型。
trigger: 修改或推送 AGENTS、Skills、.codex 配置、语义评测或 codex-workflow CI 时。
status: active
last_verified: 2026-09-05
source: user-confirmed
---

# Workflow push gates

## Confirmed preference

工作流改动不能在只通过通用 `npm run verify` 后直接推送；开发者要求避免重复出现推送后才暴露的语义评测或远端配置失败。

## Required behavior

- 推送前运行 `npm run check:skills`、`npm run check:memory` 和 `npm run test:skill-routing`。
- 语义评测复用开发者已经登录的本地 Codex CLI，不把模型调用搬到 GitHub Actions。
- GitHub CI 只运行无需密钥的确定性检查，不要求 `CODEX_API_KEY`。
- 相关门禁未通过时不推送，不把未运行项报告为已验收。

## Evidence

commit `7a16edc` 推送前只运行通用 verify，未运行本地语义路由评测；推送后，不需要的 API-backed `semantic-evaluation` 又因缺少 `CODEX_API_KEY` 在执行项目评测前失败。开发者明确纠正：该仓库使用本地 Codex CLI，不需要 API key 功能。
