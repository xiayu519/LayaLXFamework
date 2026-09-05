---
type: decision
scope: laya-resource-packaging
description: Laya 资源按 bootstrap、功能包、共享包和开发素材分层；功能内部再按类型组织，以首次可交互为首包边界。
trigger: 新建或移动 Scene、UI、Prefab、Spine、音频、数据资源，或配置小游戏分包时
status: superseded
last_verified: 2026-09-05
source: user-confirmed
---

# Laya resource package layout

已由 [Laya resource package layout v2](resource-package-layout-v2.md) 替代；新版本拆分 framework/game 启动资源所有权。

## Decision

- `assets/bootstrap/<type>` 只保存首次交互前必需资源，是唯一 `alwaysIncluded` 根。
- `assets/packages/<feature>/<type>` 保存一个功能的完整资源依赖；`assets/shared/<domain>/<type>` 只保存已证明值得跨包复用的资源。
- UI、Scene 与 Prefab 分别进入 `ui`、`scenes`、`prefabs`；Spine Prefab、骨骼、图集和纹理共置于 `spine/<name>`。
- 每个实际功能/共享目录对应 Laya `subpackages` 条目，使用 `packAllAssets=true`、`autoLoad=false`；进入功能前等待 `Laya.loader.loadPackage(path)`。
- `assets/library` 只保存开发模板，运行时资产不能引用它。

## Evidence

LayaAir 3.4.1 CLI 已接受迁移后的启动 Scene/UI/Luban 路径；`validate:resource-layout`、发布产物检查和 Headless Chromium 均通过。

## Re-evaluate when

确定具体小游戏平台、远程资源部署方式，或真实功能依赖证明当前包边界需要调整时。
