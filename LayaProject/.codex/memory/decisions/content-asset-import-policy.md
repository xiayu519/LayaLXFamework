---
type: decision
scope: content-assets
description: LayaAir 3.4.1 图片、图集、音频与 Spine 4.2 使用版本化导入策略、文件头门禁和精确路径例外。
trigger: 新增或修改运行时图片、图集、音频、Spine 导出文件或纹理 .meta 时
status: active
last_verified: 2026-09-04
source: external-verified
---

# Content asset import policy

## Decision

`settings/AssetImportPolicy.json` 固定运行时源格式和 Laya `.meta` 规则，`validate:content-assets` 扫描全部运行时资源包。普通 2D 图片使用 SpriteTexture；音频按 BGM/SFX/voice 分类；Spine 固定 4.2、优先 `.skel`、共置依赖且页图使用直通 Alpha。

GPU 压缩由发布转换生成。透明 SpriteTexture 不批量开启压缩，只有目标设备验收后的具体路径才能进入例外。母版不进入 `assets/`。

## Evidence

规则来自 LayaAir 3.x 纹理、图集、压缩、音频与 Spine2DRenderNode 文档，以及 Spine 官方导出说明；本地 `editor-env.d.ts` 确认导入字段，单元测试验证门禁和文件头解析。真实设备兼容与性能不在静态验证结论内。
