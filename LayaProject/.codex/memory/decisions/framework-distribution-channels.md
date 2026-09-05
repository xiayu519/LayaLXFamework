---
type: decision
scope: framework-distribution
description: 下游以显式 release 或 snapshot 双轨同步框架；两者都锁定不可变 commit，只有 release 要求 SemVer Tag。
trigger: 发布框架、同步下游、修改 framework lock、channel 策略或上游完整性校验时。
status: active
last_verified: 2026-09-05
source: code-verified
---

# Framework distribution channels

## Context

框架开发期的多次提交仍属于同一 manifest 版本。要求每次下游联调前都升级版本并创建 Tag，会把开发快照误当成正式发布。

## Decision

- `--ref vX.Y.Z` 是 release 模式，SemVer Tag、manifest version 与锁定 commit 必须一致。
- `--channel main` 是 snapshot 模式，只在下游显式执行同步时解析 channel 最新提交；lock 固定当时的 commit，之后不会随 channel 自动漂移。
- lock v2 记录 `source.mode`、`source.ref`、`commit`、`manifestVersion`、manifest 哈希和逐文件哈希；校验器继续兼容既有 release lock v1。
- snapshot 上游校验检出 lock 中的 commit，并要求该 commit 仍可从 channel 到达；用于同步的 channel 禁止 force-push。
- managed files 在两种模式下都保持下游只读，同步仍经独立分支和完整回归。

## Consequences

日常框架提交不再要求 Tag；下游可按需重复运行 `framework:sync -- --channel main` 更新。正式稳定交付仍使用 Tag。尚未包含 snapshot 功能的旧下游工具需要先通过正式版本或受控引导升级一次。

## Re-evaluate when

框架改为 package registry 发布、Git 托管无法保留 channel 历史，或团队决定让下游自动跟随浮动分支时。
