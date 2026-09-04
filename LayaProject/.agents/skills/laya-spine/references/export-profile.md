# LayaAir 3.4.1 Spine 导出与导入规格

- 项目固定 `PlayerSettings.spineVersion=4.2`；Spine Editor 导出版本必须与运行时 `major.minor` 一致。升级版本属于项目级变更，需同时复核 Laya 模块、资产与发布包。
- 生产资源优先二进制 `.skel`，它通常比 JSON 更小、解析更快；确需 `.json` 时将具体路径加入 `AssetImportPolicy.exceptions.jsonSpine`。
- 每个角色共置在 `spine/<name>/`：一个 `.skel` 或 `.json` 主文件、`.atlas`、其引用的全部页图以及使用它的 `.lh` Prefab。运行时只加载主文件；不要分别加载 `.atlas` 和页图。
- 页图按 Spine 的直通 Alpha 路线导出：关闭 Spine 导出 PMA；Laya `.meta` 固定 `textureType=0`、`sRGB=true`、`premultiplyAlpha=false`。这与普通 UI SpriteTexture 规则不同。
- 默认开启 `useFastRender`，网格单顶点最多 4 个骨骼影响；使用 `externalSkins` 时不得宣称 fast render 生效。池化时复用整个 `.lh`，归还前停止播放并重置组件状态。
- Spine master、导出 preset 和源贴图留在 `Design/` 或美术源仓，不把 `.spine` 母版放进运行时 `assets/`。

参考：[LayaAir Spine2DRenderNode](https://layaair.com/3.x/doc/IDE/Component/2D/2DRender/Spine2DRenderNode/)、[Spine 官方导出说明](https://esotericsoftware.com/spine-export/)。
