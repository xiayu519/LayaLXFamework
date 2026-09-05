---
type: decision
scope: development-workflow
description: 日常验证使用无 Laya CLI 的快速门禁，领域工具按相关改动触发，完整双平台 Headless 只用于正式发布或手动验收。
trigger: 选择本地验证命令，或修改 verify、测试分组、Laya/Luban/Codex CLI 与 GitHub Actions 时
status: active
last_verified: 2026-09-05
source: user-confirmed
---

# Validation profiles

## Context

旧 `verify` 同时启动 13 个 npm 子进程，并在每次 push 的 Windows/macOS job 中分别安装环境、执行全量测试、构建 LayaAir 包和启动 Headless Chromium。普通改动因此重复运行无关工具，还会因资源争用暴露误超时。

## Decision

- `npm run verify` 是默认快速门禁，不检测或调用 LayaAir CLI、.NET、Python、浏览器或模型；静态任务最多 3 路并发。
- 快速档按命令的传递执行路径而不是脚本名称判定依赖；`tests/workflow/CodexWorkflow.test.ts` 必须在无效 `LAYAAIR_INSTALL_DIR`/`PYTHON_PATH` 下实跑完整 `npm run verify`。`validate:assets` 只做 Node 静态检查，LayaAir 3.4.1 官方解析由 `validate:assets:laya` 显式升级。
- AGENTS、Skills、memory 与 workflow 只在相关路径变化时进入独立 Workflow validation；模型语义评测仍只在本地显式执行一次。
- Luban 只在表源、生成物、配置或工具变化时运行 `npm run tables:check`。
- `npm run verify:release` 才执行环境检查、完整测试、引擎源码、Luban 和一次真实 Headless 构建；双平台 CI 仅由 `v*` Tag 或手动触发。
- Codex CLI 只用于 AGENTS/Skills/语义路由变更；GitHub CLI 只用于明确要求的远端状态查询或实际失败诊断，不属于代码验收。

## Consequences

日常 push 只运行单 runner 快速检查；不能用快速门禁宣称 Laya 发布包或 Windows/macOS 已验证。涉及运行时、资源发布链或正式发布时，必须显式升级到对应领域检查或 release profile。

## Re-evaluate when

测试分组出现环境依赖泄漏、发布 profile 漏掉真实发布风险，或 CI 平台与发布策略发生变化时。
