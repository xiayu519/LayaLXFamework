---
type: problem
scope: codex-workflow
description: 语义路由评测若依赖 PowerShell 就无法复用到 macOS；固定 Codex CLI 必须由跨平台 Node 执行器隔离调用。
trigger: 修改 Skill 路由评测、Codex CLI 版本、模型隔离参数或 Windows/macOS 工作流时
status: active
last_verified: 2026-09-05
source: code-verified
---

# Codex routing eval isolation v2

## Reproduction

原评测入口由 Node 启动 `test-skill-routing.ps1`，macOS 默认没有 PowerShell，因此相同的 `npm run test:skill-routing` 无法保证可用。

## Root cause

CLI 版本选择、临时目录、结果比较和 token 预算全部实现在 Windows shell 中，跨平台 Node 入口只是转发层。

## Fix or avoidance

评测完全迁移到 Node，通过当前 npm CLI 执行固定 `@openai/codex@0.153.2`，继续使用 `--ephemeral --ignore-user-config --sandbox read-only` 并关闭 plugins/apps。临时目录只在系统 temp 直属子目录中创建和删除。

## Verification

Windows 原地执行 30 个 case 全部精确匹配；单次评测使用 15,029 input、911 output、470 reasoning tokens，没有启动 IDE、浏览器或复制项目。macOS 的同一入口由双平台工作流约束和实际开发环境继续验证。
