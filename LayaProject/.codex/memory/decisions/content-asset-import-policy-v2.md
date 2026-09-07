---
type: decision
scope: content-assets
description: LayaAir 3.4.1 图片、图集、音频与 Spine 3.8 使用版本化导入策略、文件头门禁和精确路径例外。
trigger: 新增或修改运行时图片、图集、音频、Spine 3.8.x 导出文件或纹理 .meta 时
status: superseded
last_verified: 2026-09-07
source: user-confirmed
---

# Content asset import policy v2

Superseded by [Content asset import policy v3](content-asset-import-policy-v3.md).

## Context

下游战斗资源由 Spine Editor 3.8.87 导出，原有 Spine 4.2 公共基线会阻止该资源进入业务。LayaAir 3.4.1 支持选择 Spine 3.8 运行时，且项目运行时必须与资源导出的 `major.minor` 匹配。

## Decision

`PlayerSettings.spineVersion`、`AssetImportPolicy.spineRuntime` 和 framework manifest 下游契约统一固定为 `3.8`，Spine Editor `3.8.x` 资源按该运行时导入。继续使用 `Spine2DRenderNode`、优先 `.skel`、共置主文件/atlas/页图/Prefab，并保持页图直通 Alpha。Spine 3.8 业务不得调用仅 4.2 支持的物理更新和平移能力。

## Consequences

下游同步本基线后会获得 Spine 3.8 项目配置与内容门禁。LayaAir 3.4.1 原地构建和 Headless Chromium 已确认发布运行态为 Spine 3.8；上游没有代表性 Spine 资源，真实动画、皮肤、池化、内存和 DrawCall 仍必须在下游用实际 3.8.87 资源验收。

## Re-evaluate when

所有生产 Spine 资源统一升级到新的 `major.minor`，或业务明确需要 Spine 4.2 物理能力时，重新评估并整体切换公共基线；禁止单个业务私自混用运行时。
