---
type: problem
scope: config-pipeline
description: Luban 生成的 .meta 和 TypeScript 会因平台换行差异产生字节级误报，导致 Windows CI 将当前输出判为陈旧。
trigger: 修改 Luban 生成、meta UUID、陈旧检查、gitattributes 或跨环境 CI 时
status: active
last_verified: 2026-09-04
source: external-verified
---

# Luban generated text line endings

## Failure

`.meta` 内容和 UUID 完全一致时，Git checkout 仍可能改变换行；Luban 自身生成的 `schema.ts` 也会随宿主系统产生 LF 或 CRLF。逐字节比较因此可能在 Windows runner 将语义相同的生成物判为陈旧。

## Guard

仓库通过 `.gitattributes` 固定文本为 LF；生成和陈旧检查对 `.meta`、`.ts` 统一 CRLF/CR 为 LF。二进制表继续逐字节比较，禁止对所有生成物做文本归一化而掩盖真实差异。

## Evidence

GitHub Actions run `33870148885` 复现了 `.meta` 差异，run `33938475958` 复现了 `schema.ts` 差异；`npm run tables:check` 与 Windows/macOS 完整门禁验证修复。
