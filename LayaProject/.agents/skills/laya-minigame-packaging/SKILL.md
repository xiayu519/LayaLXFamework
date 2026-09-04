---
name: laya-minigame-packaging
description: 规划或验证 LayaAir 小游戏首包、资源分包、远程包、subpackage 构建配置、loadPackage 时机和包体预算时使用；普通资源加载释放与源资产序列化不触发。
---

# LayaAir Mini-game Packaging

1. 先读 [package-layout.md](references/package-layout.md)，再检查 `settings/ResourceLayout.json`、`settings/BuildSettings.json` 和目标平台当前官方规则。
2. 以首次可交互为首包边界；功能资源按完整生命周期共置，不能按全局文件类型拆散。
3. 每个实际存在的功能或共享包都必须配置 Laya `subpackages`，设置 `packAllAssets=true` 且不在启动时自动加载；目标平台确有要求时再配置远程地址或脚本入口。
4. 启动资源不得引用延迟包；功能包不得互相引用。进入功能前显式等待 `Laya.loader.loadPackage(path)`，失败时保持在当前可交互状态。
5. 运行 `npm run validate:resource-layout`；目标平台构建后用 `scripts/analyze-package-size.mjs` 传入当期官方包体限制，不写死易变化的额度。
