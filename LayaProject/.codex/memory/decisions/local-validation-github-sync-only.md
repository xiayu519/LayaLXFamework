---
type: decision
scope: development-workflow
description: GitHub Actions 只校验框架同步契约；本机工具链与全部开发、领域和发布验收均由开发者本地按需执行。
trigger: 修改 GitHub Actions、framework manifest/lock、环境检测、验证分层或发布验收时
status: active
last_verified: 2026-09-05
source: user-confirmed
---

# Local validation and GitHub sync-only contract

## Context

GitHub Runner 不是开发者本机，不能用 Runner 缺少 LayaAir、.NET、Python、浏览器或 Codex CLI 推断本机环境未准备。把这些工具安装与运行放入 push/Tag Workflow 会把本地验收和框架同步错误耦合，并产生与下游使用无关的失败通知。

## Decision

- GitHub Actions 只保留 `framework-sync.yml`，运行 framework upstream、manifest/lock 完整性和同步工具专项测试。
- GitHub 不安装、探测或执行 LayaAir、.NET、Python、浏览器、Codex CLI、Luban、游戏测试和发布构建；Tag 也不自动触发这些验收。
- `npm run verify`、领域命令和 `npm run verify:release` 保留为本地按风险选择的入口。缺少环境时，本地命令指向 `Books/LXFamework-Environment.md`，不要求配置 GitHub Secrets。
- Windows/macOS 兼容及发布结论只能来自相关平台的本地原地验收；GitHub 同步契约成功不代表运行时或发布验证成功。

## Consequences

GitHub 只保护下游同步来源和受管文件，不替代开发者验收。旧 Workflow 从 manifest 移除后，下游下一次批准的 framework sync 会按旧 lock 删除对应文件。

## Re-evaluate when

维护规模扩大且明确需要独立的托管构建基础设施，或 GitHub 提供与目标本机完全等价并由开发者批准的验收环境时。
