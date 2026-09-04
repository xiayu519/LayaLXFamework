# LayaAir 3.4.1 图片导入规格

## 运行时源文件

- 色彩或透明图优先 `.png`；无 Alpha 的大背景、照片类资源可用 `.jpg/.jpeg`；确认目标平台解码支持后可用 `.webp`。PSD、TGA、TIFF、Aseprite 等母版留在 `Design/` 或美术源仓，不进入 `assets/`。
- 普通 UI/2D 图片：`textureType=2`、`sRGB=true`（省略时可继承默认）、`premultiplyAlpha=true`（省略时使用 Laya sprite 默认）、`generateMipmap=false`、`readWrite=false`。
- 像素风资源使用 `filterMode=0`；普通 UI 使用线性过滤。只有确实缩小/缩放显示的非固定 UI 纹理才开启 mipmap，且记录到 `mipmappedTextures`。
- 遮罩、法线或数值数据图才关闭 sRGB，并记录到 `linearTextures`。CPU 读像素才开启 `readWrite`，它会增加一份可读内存，必须记录到 `readableTextures`。

## 尺寸与图集

- 单图最长边默认不超过 4096。自动图集保持 `2048x2048`、单条目 `512x512`、`scale=1`、`pot=false`、`trimImage=true`。
- 图集按功能包组织，避免启动包或共享包吸入低频资源。大背景、频繁独立更新或不会连续绘制的图片不强塞图集。
- 合批取决于实际渲染顺序、纹理与材质连续性；修改图集后用真实发布包统计 DrawCall，不以目录或图集数量代替证据。

## 平台压缩

- ASTC/ETC 等由 Laya 构建转换生成，`.ktx/.dds/.pvr` 不作为源文件提交。
- LayaAir 3.4 系列曾有压缩 SpriteTexture 的 premultiplied-alpha 标记问题；透明 UI 不批量开启 GPU 压缩。只有目标设备画面与 Alpha 边缘验收通过后，才把具体路径加入 `compressedSpriteTextures`。
- 若确需 ASTC，普通非 UI 色彩图从 6x6 质量档起测，并同时验证包体、显存、首帧上传和低端机兼容性。

参考：[LayaAir 纹理资源](https://layaair.com/3.x/doc/IDE/assets/texture/readme.html)、[图集配置](https://www.layaair.com/3.x/doc/IDE/assets/atlascfg/readme.html)、[纹理压缩](https://www.layaair.com/3.x/doc/IDE/uiEditor/textureCompress/)。
