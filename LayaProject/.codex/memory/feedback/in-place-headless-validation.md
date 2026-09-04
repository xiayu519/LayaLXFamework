---
type: feedback
scope: validation
description: 除非明确要求 GUI，自动验收必须在当前项目原地 Headless 执行，并在完整验收前提下并行独立检查、避免重复。
trigger: 设计、修改或执行构建、NoRender、浏览器、工作流路由和交付验证时。
status: active
last_verified: 2026-09-04
source: user-confirmed
---

# In-place Headless validation

## Required behavior

- 命令工作目录是当前项目根目录。
- Laya 验收直接调用固定 3.4.1 CLI；浏览器使用 Headless Chromium/CDP。
- 不创建项目副本，不启动 LayaAirIDE 或可见浏览器，不用 mock 代替真实 `Laya.init()` 与 ui2 生命周期。
- 独立检查可以并行；已通过且没有相关文件变化的检查不重复，完整验收只执行一次真实发布链路。
- 无法由 Headless 证明的真实商店、小游戏容器或 Native 行为必须明确报告为未验证项。
- 只有开发者明确要求时才执行 GUI 验证。

## Evidence

开发者在本项目工作流对齐中明确确认。
