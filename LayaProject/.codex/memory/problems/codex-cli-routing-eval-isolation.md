---
type: problem
scope: codex-workflow
description: 旧 Codex CLI 会因模型缓存 schema 不兼容失败，全局插件还会截短项目 Skill 描述并显著增加输入 token。
trigger: 语义路由 eval 出现 base_instructions、MCP 启动错误、Skill description truncated 或异常高输入 token 时。
status: superseded
last_verified: 2026-09-05
source: code-verified
---

# Codex CLI routing eval isolation

## Reproduction

全局 `codex-cli 0.144.1` 执行路由 eval 时读取了缺少 `base_instructions` 的新模型缓存，并继承用户 MCP；未关闭插件的最小探针输入为 19,329 tokens，提示 Skill 描述被截短。

## Fix or avoidance

`test-skill-routing.ps1` 检测版本；低于 `0.153.2` 时通过 `npx` 使用精确锁定版本。评测使用 `--ephemeral --ignore-user-config --sandbox read-only`，关闭 `plugins` 与 `apps`，一次调用覆盖全部 case。

## Verification

14 个 case 全部精确匹配，单次评测为 13,588 input、537 output、333 reasoning tokens；项目未复制，未启动可见窗口。

## Superseded by

[Codex routing eval isolation v2](codex-routing-eval-isolation-v2.md) 以跨平台 Node 执行器替代 PowerShell 包装。
