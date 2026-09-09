---
type: problem
scope: headless-validation
description: Headless CDP 客户端必须显式使用固定版本 WebSocket 依赖，不能依赖某个 Node 版本的全局对象。
trigger: 诊断 CDP WebSocket 缺失、Node 环境差异或修改浏览器客户端时
status: active
last_verified: 2026-09-05
source: external-verified
---

# Headless CDP runtime portability

## Failure

Headless 浏览器已经启动，但 macOS 的 Node 20 runner 在创建 CDP socket 时抛出 `ReferenceError: WebSocket is not defined`。本地较新 Node 暴露的全局对象会掩盖这个问题。

## Guard

该故障解释了 CDP 工具显式导入 `ws` 的原因，当前入口见 [test-browser.mjs](../../../tools/test-browser.mjs)。Node 20 runner 是历史复现环境；当前版本与验收范围以 [开发环境](../../../../Books/LXFamework-Environment.md) 和 [AGENTS.md](../../../AGENTS.md) 为准。

## Evidence

GitHub Actions run `33938475958` 复现 macOS 失败；后续双平台门禁与本地原地 `npm run test:headless` 验证修复。
