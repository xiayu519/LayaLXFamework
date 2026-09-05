---
type: feedback
scope: codex-workflow
description: 框架由一人维护、投入使用后约 2–3 人协作；Codex 默认单代理，不把使用团队规模当作委派数量。
trigger: 规划 Codex 任务委派、解释维护模式，或多人同时修改目标文件时。
status: active
last_verified: 2026-09-05
source: user-confirmed
---

# Single-maintainer collaboration

## Confirmed preference

框架由一人维护。框架投入使用后约有 2–3 人协作，但这描述的是使用团队，不是框架维护人数，也不是每个 Codex 任务的代理数量。

## Required behavior

- Codex 默认由单代理执行。
- 仅任务确实跨独立风险边界或用户明确要求时委派；不得仅因团队有 2–3 人就启动多个代理。
- 委派仍须隔离文件和语义区域，子代理默认继承主线程，最终验收不降级。
- 多人或多代理并行写入时保留冲突保护：写前复查，发现同一语义区域并发变化就停止并报告。

## Evidence

2026-09-05，开发者明确指出框架只有一名维护者，2–3 人是使用阶段的团队规模，并确认无条件要求 2–3 人协作是错误规则。
