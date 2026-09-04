---
type: decision
scope: framework-network
description: HTTP 默认不重试；只有 GET、HEAD 或带显式幂等键的 POST 可重试瞬时网络、超时和指定状态码。
trigger: 修改 HttpTransport 重试、超时、取消、错误映射或 POST 请求策略时
status: active
last_verified: 2026-09-04
source: code-verified
---

# HTTP retry idempotency

## Decision

`HttpRetryPolicy.maxAttempts` 包含首次请求且限制为 1–5。GET/HEAD 可启用退避；POST 只有提供非空 `idempotencyKey` 才允许多次尝试，并自动发送 `Idempotency-Key`。只重试网络错误、超时与显式瞬时状态码；取消、验证、初始化和同步派发错误不重试。

`HttpTransportError` 保留 `kind/status/retryable/attempt/maxAttempts`，让业务在不解析文案的情况下决策。默认策略 `maxAttempts=1`，不会改变未配置调用的请求次数。

## Evidence

`tests/LayaAdapters.test.ts` 覆盖验证前失败、JSON body、GET 重试上限、终态元数据、POST 幂等键和超时中止。
