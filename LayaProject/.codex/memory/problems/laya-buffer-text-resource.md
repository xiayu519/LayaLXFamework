---
type: problem
scope: runtime-config
description: LayaAir 3.4 Loader.BUFFER 返回 TextResource 而不是裸 ArrayBuffer，直接断言会使配置启动失败。
trigger: 加载 .bin、bytes、fui 或实现二进制配置读取时
status: active
last_verified: 2026-09-04
source: code-verified
---

# Loader.BUFFER wraps binary data

## Reproduction

Headless Web 发布包加载 `config/game/tbtableappconfig.bin` 后，`instanceof ArrayBuffer` 失败，`game-config` 服务回滚。

## Root cause

LayaAir 3.4 为 `bin/bytes/fui` 注册 `BytesAssetLoader`；它把 fetch 的 ArrayBuffer 包在 `TextResource.data` 中返回。

## Fix or avoidance

读取 `TextResource.data`，并兼容裸 `ArrayBuffer` / `ArrayBufferView` 后再构造 `Uint8Array`。不要使用 Node `Buffer` polyfill。

## Verification

实际 LayaAir 3.4.1 Web 构建由 Headless Chromium 加载 `.bin`，`LX.Config` 查询值为 `LXFamework`。
