---
name: laya-assets
description: 编辑或诊断 LayaAir .ls/.lh 源资产、UUID、_$ref、res://、脚本挂载、序列化和构建收集规则时使用；Spine2DRenderNode、图片导入参数与运行时资源释放不触发。
---

# Laya Assets

1. 先读 [source-assets.md](references/source-assets.md)，再检查相邻资产、`.meta`、`settings/ResourceLayout.json` 和 `settings/BuildSettings.json`。
2. 保持 UUID 唯一；`_$ref`、`res://`、startup scene 与脚本组件 UUID 必须能解析到真实源文件。
3. 固定节点与组件直接声明在 `.ls` / `.lh`，不以运行时补建绕过序列化问题。
4. 字符串动态加载的启动资源进入 `alwaysIncluded`；延迟包使用 Laya `subpackages[].packAllAssets`，源目录存在不能替代发布包收集验证。
5. 普通资产修改先运行无 Laya 依赖的 `npm run validate:assets`；修改 `.ls/.lh`、其 `.meta` 或脚本挂载时，再运行一次 `npm run validate:assets:laya`。改动资源位置时追加 `npm run validate:resource-layout`，需要发布验收时运行 `npm run test:headless`。
