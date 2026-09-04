---
name: laya-texture
description: 设置或审查 LayaAir 2D 图片源格式、纹理 .meta 导入参数、图集与平台纹理压缩时使用；.ls/.lh UUID、运行时动态纹理释放与 Spine 页纹理不触发。
---

# Laya Texture

1. 先读 [import-profiles.md](references/import-profiles.md)，再检查源图、相邻 `.meta`、`settings/AssetImportPolicy.json` 与所属资源包。
2. 普通 UI/2D 色彩图使用 `textureType=2`；数据图、mipmap、`readWrite`、直通 Alpha 与平台压缩必须有明确用途和策略例外。
3. 图集只合并同功能、可能连续绘制的小图；不能仅凭“进同一图集”宣称 DrawCall 已下降。
4. 修改后运行 `npm run validate:content-assets`；涉及发布转换或渲染结果时再运行 `npm run test:headless`，平台压缩仍需目标设备专项验证。
