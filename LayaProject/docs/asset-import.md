# LayaAir 内容资产导入规格

`settings/AssetImportPolicy.json` 是可执行策略，`npm run validate:content-assets` 会扫描 `bootstrap/packages/shared`，校验图片 `.meta`、图集、音频文件头、Spine 包结构和固定运行时版本。美术与音频母版保留在外层 `Design/` 或专用源仓，不进入运行时 `assets/`。

## 图片

| 用途 | 源格式 | Laya 导入 |
| --- | --- | --- |
| 普通 UI/2D 透明图 | PNG | `textureType=2`、sRGB、PMA、无 mipmap、无 readWrite |
| 无 Alpha 大背景/照片 | JPG/JPEG | 同为 `textureType=2`，质量以真机观感和包体确定 |
| 已验证目标平台的普通色彩图 | WebP | 先验证解码与首帧，再作为源格式 |
| 像素风 | PNG | `filterMode=0`，其余遵循普通 2D 规则 |
| 数据/遮罩图 | PNG | 可关闭 sRGB，但必须加入 `linearTextures` 例外 |

单图最长边默认 4096。自动图集使用 2048×2048、单条目 512×512、`scale=1`、不强制 POT、裁剪透明空白。图集按功能包组织，DrawCall 是否改善必须以真实渲染顺序和统计为准。

GPU 压缩由 Laya 发布转换生成，不提交 `.ktx/.dds/.pvr` 源文件。透明 SpriteTexture 不批量开启压缩；LayaAir 3.4 系列存在过压缩纹理 PMA 标记修复记录，只有目标设备 Alpha 边缘与内存验收通过后，才将具体路径加入 `compressedSpriteTextures`。

## 音频

| 目录 | 默认格式 | 规格 |
| --- | --- | --- |
| `audio/bgm/` | MP3 | 44.1 kHz，96 kbps 起测，最高 128 kbps |
| `audio/sfx/` | WAV | 16-bit PCM、44.1 kHz；短音效优先 mono |
| `audio/voice/` | MP3 | 44.1 kHz，通常 64–96 kbps |

门禁解析 WAV/MP3 文件头并限制采样率、位深和 MP3 码率。文件头通过不等于设备解码通过；Web、小游戏和 Native 仍需代表性资产的首播、循环、焦点恢复和内存专项验证。

## Spine

- 项目固定 `PlayerSettings.spineVersion=4.2`，导出器必须匹配 `major.minor`。
- 生产优先 `.skel`；JSON 只能按具体路径加入 `jsonSpine` 例外。
- 一个 `spine/<name>/` 共置一个主文件、`.atlas`、全部页图和 `.lh` Prefab；运行时只加载主文件。
- 页图固定 `textureType=0`、`sRGB=true`、`premultiplyAlpha=false`，Spine 导出关闭 PMA；这与普通 UI 图片不同。
- 默认使用 `useFastRender`，网格单顶点最多 4 个骨骼影响。真实动画、皮肤组合、池化、内存和 DrawCall 必须在业务提供资产后专项验证。

例外必须精确到 `assets/` 相对路径，不能用目录通配掩盖新资产。修改资产至少运行：

```shell
npm run validate:assets
npm run validate:content-assets
npm run validate:resource-layout
```

上述命令均不需要 Laya CLI；只有 `.ls/.lh`、其 `.meta` 或脚本挂载发生变化时，才追加 `npm run validate:assets:laya` 调用 LayaAir 3.4.1 官方解析器。
