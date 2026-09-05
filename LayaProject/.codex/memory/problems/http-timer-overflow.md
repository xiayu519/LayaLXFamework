---
type: problem
scope: client-network
description: HTTP timer 超过 2_147_483_647ms 会被宿主截断为约 1ms；请求与重试延迟必须校验上限，并把 jitter 结果限制在 maxDelayMs。
trigger: 修改 HttpTransport timeout、retry backoff、jitter 或任何传给宿主 timer 的毫秒参数时。
status: active
last_verified: 2026-09-05
source: code-verified
---

# HTTP timer overflow

## Reproduction

把 `2_147_483_648` 传给宿主 `setTimeout` 会发生 32-bit timer 溢出，在 Node 复现为 `TimeoutOverflowWarning` 且实际延迟约为 `1ms`。这会让看似很长的 HTTP timeout 或 retry delay 立即触发。

## Root cause

`HttpTransport` 原校验只要求有限非负数，没有约束宿主 timer 的最大延迟；retry jitter 也可能把已受限的指数退避再次推高到 `maxDelayMs` 之外。

## Fix or avoidance

统一以 `2_147_483_647ms` 为上限校验 `timeoutMs`、`baseDelayMs` 和 `maxDelayMs`，越界时在创建请求前返回 validation error；jitter 计算后的最终值再次 cap 到 `maxDelayMs`。

## Verification

`tests/framework/LayaAdapters.test.ts` 覆盖三个越界入口、宿主最大合法值，以及 `Math.random() = 1` 时 jitter 仍不超过 `maxDelayMs`。
