# LayaAir 3.4.1 Spine 导出与导入规格

- 项目固定 `PlayerSettings.spineVersion=3.8`；Spine Editor `3.8.x`（包括 `3.8.87`）导出版本与该运行时的 `major.minor` 一致。切换版本属于项目级变更，需同时复核 Laya 模块、资产与发布包。
- `.skel` 与 `.json` 都是正式支持的主文件；二进制通常更小、解析更快，JSON 则由资产门禁读取 `skeleton.spine` 并校验其 `major.minor` 与项目运行时一致。
- 每个角色共置在合法资源包的 `spine/<name>/`：一个 `.skel` 或 `.json` 主文件、与主文件同名的 `.atlas`、其引用的全部页图以及使用它的 `.lh` Prefab。运行时只加载主文件；不要分别加载 `.atlas` 和页图。
- 代码动态加载 JSON 主文件时显式传入 `Laya.Loader.SPINE`；资产目录不会改变 `.json` 的通用 Loader 类型。
- 页图按 Spine 的直通 Alpha 路线导出：关闭 Spine 导出 PMA；Laya `.meta` 固定 `textureType=0`、`sRGB=true`、`premultiplyAlpha=false`。这与普通 UI SpriteTexture 规则不同。
- 默认开启 `useFastRender`，网格单顶点最多 4 个骨骼影响；使用 `externalSkins` 时不得宣称 fast render 生效。池化时复用整个 `.lh`，归还前停止播放并重置组件状态。
- Spine 3.8 不支持 4.2 的物理更新和平移能力；即使 LayaAir 3.4.1 类型中存在相应 API，也不得调用。
- Spine master、导出 preset 和源贴图留在 `Design/` 或美术源仓，不把 `.spine` 母版放进运行时 `assets/`。

参考：[LayaAir Spine2DRenderNode](https://layaair.com/3.x/doc/IDE/Component/2D/2DRender/Spine2DRenderNode/)、[Spine 官方导出说明](https://esotericsoftware.com/spine-export/)。
