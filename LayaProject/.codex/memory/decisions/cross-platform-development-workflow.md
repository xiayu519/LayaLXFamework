---
type: decision
scope: development-workflow
description: Windows 与 macOS 共用同一框架、AGENTS、Skills 和 npm 命令，操作系统差异只留在工具内部并由双平台 CI 验证。
trigger: 修改开发工具、路径、CLI、CI、Headless 验证、文档命令或游戏工作流时
status: superseded
last_verified: 2026-09-05
source: user-confirmed
---

# Cross-platform development workflow

Superseded by [Validation profiles](validation-profiles.md).

## Context

团队成员同时使用 Windows 与 macOS。仅声明 Node 代码“理论可移植”不能覆盖 IDE、LayaAir CLI、浏览器、shell、换行和大小写文件系统差异。

## Decision

业务和框架代码不按桌面系统分叉；两端使用相同 npm 命令。开发人员按官方文档准备本机环境，仓库工具只检测、不安装系统软件；CI runner 仍隔离准备固定版本以保证可重复验收。工具以 Node 跨平台 API 为默认实现，确有系统差异时显式发现可执行文件。仓库文本固定 LF，批处理保留 CRLF；Windows/macOS CI 分别原地执行完整 `npm run verify`。

## Consequences

新增本机工具不得安装系统依赖，也不得依赖单一系统 shell、盘符或隐式 PATH。非标准位置使用 `LAYAAIR_INSTALL_DIR`、`LAYAAIR_IDE_HOME`、`BROWSER_PATH`、`PYTHON_PATH` 覆盖。未经双平台实际验证不能宣称完整兼容。

## Re-evaluate when

LayaAir 版本、官方 CLI 目录结构、团队支持系统或 GitHub runner 架构发生变化时。
