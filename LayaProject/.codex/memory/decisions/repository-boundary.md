---
type: decision
scope: repository
description: Git 根目录位于外层 LayaLXFamework，完整 Codex 工作流保留在 LayaProject，并从该目录启动 Codex。
trigger: 初始化 Git、准备上传、调整忽略规则或排查 AGENTS/.codex 加载范围时。
status: active
last_verified: 2026-09-04
source: user-confirmed
---

# Repository boundary

## Decision

- Git 根目录：`D:\layapro\LayaLXFamework`。
- Codex 工作目录：`D:\layapro\LayaLXFamework\LayaProject`。
- `.agents/`、`.codex/`、源码、资源、测试、工具、引擎声明与项目设置纳入版本控制。
- LayaAir 缓存、本地状态、依赖、发布产物和编译 bundle 由外层 `.gitignore` 排除。

## Reason

Codex 会从 Git 根目录向当前工作目录逐层加载项目指令和配置，因此工作流可以留在 `LayaProject`，同时让外层 `Books` 与项目一起进入仓库。
