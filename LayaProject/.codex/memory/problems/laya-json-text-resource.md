---
type: problem
scope: runtime-json
description: LayaAir 3.4.1 Loader.JSON 返回 TextResource；把返回值当裸 JSON 会导致发布包类型校验失败。
trigger: 实现或诊断 JSON 加载、类型校验、缓存释放，或 Node 单测与真实发布包行为不一致时
status: active
last_verified: 2026-09-05
source: code-verified
---

# Laya Loader.JSON TextResource

## Reproduction

Node 单测把 `Laya.loader.load(..., Loader.JSON)` 模拟为裸对象时通过，但真实 LayaAir 3.4.1 发布包在 `LX.Config` 校验阶段失败。

## Root cause

固定版本 `Loader.ts` 明确声明 JSON 返回 `TextResource`，解析后的对象位于公开的 `TextResource.data`。

## Fix

`JsonConfigService` 要求返回值是 `Laya.TextResource`，只把 `data` 交给业务校验器；测试也使用同形态 mock。加载失败、校验失败、release 和 dispose 都清理对应 Loader 缓存。

## Verification

类型检查和 64 项单测通过；LayaAir 3.4.1 CLI 原地构建后的 Headless Chromium 成功读取 JSON，并确认停机后缓存已释放。
