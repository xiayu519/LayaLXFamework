---
type: problem
scope: headless-validation
description: Headless CDP 客户端必须显式使用固定版本 WebSocket 依赖，不能依赖某个 Node 版本的全局对象。
trigger: 修改 Node 版本、Headless Chromium、CDP 客户端、浏览器发现或双平台 CI 时
status: active
last_verified: 2026-09-05
source: external-verified
---

# Headless CDP runtime portability

## Failure

Headless 浏览器已经启动，但 macOS 的 Node 20 runner 在创建 CDP socket 时抛出 `ReferenceError: WebSocket is not defined`。本地较新 Node 暴露的全局对象会掩盖这个问题。

## Guard

CDP 工具显式导入锁定版本的 `ws`，不依赖特定 Node 主版本提供全局 `WebSocket`。发布 Tag 或手动 release CI 在 Windows/macOS 上执行完整 `npm run verify:release`。

## Evidence

GitHub Actions run `33938475958` 复现 macOS 失败；后续双平台门禁与本地原地 `npm run test:headless` 验证修复。
