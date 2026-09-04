---
type: problem
scope: config-pipeline
description: Luban 生成的 .meta 在 Git 自动换行转换后会产生字节级误报，导致 Windows CI 将当前输出判为陈旧。
trigger: 修改 Luban 生成、meta UUID、陈旧检查、gitattributes 或跨环境 CI 时
status: active
last_verified: 2026-09-04
source: external-verified
---

# Luban meta line endings

## Failure

`.meta` 内容和 UUID 完全一致时，Git checkout 仍可能将 LF 转为 CRLF。旧 `config:check` 逐字节比较，GitHub Windows runner 因 `schema.ts.meta` 换行差异失败，而本机刚生成的 LF 文件通过。

## Guard

生成内容仍保持确定性 LF；陈旧检查只对 `.meta` 比较前统一 CRLF/CR 为 LF。二进制表和生成 TypeScript 继续逐字节比较，不能用全局文本归一化掩盖真实生成差异。

## Evidence

GitHub Actions run `33870148885` 复现了仅 `.meta` 变化的失败；本机 `config:check` 与后续远端静态门禁用于验证修复。
