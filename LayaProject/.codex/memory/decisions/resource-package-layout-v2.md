---
type: decision
scope: laya-resource-packaging
description: bootstrap 按 framework/game 所有权拆分，功能包和共享包继续以包边界优先组织。
trigger: 新建或移动启动 Scene、UI、Prefab、Spine、音频、数据资源，或配置小游戏分包时。
status: active
last_verified: 2026-09-05
source: code-verified
---

# Laya resource package layout v2

替代 [旧资源布局](resource-package-layout.md)。

## Decision

- `assets/bootstrap/framework/<type>` 是上游只读启动资源；`assets/bootstrap/game/<type>` 是下游游戏启动资源；`bootstrap` 仍是唯一 `alwaysIncluded` 根。
- `assets/packages/<feature>/<type>` 保存完整功能依赖；`assets/shared/<domain>/<type>` 只保存已证明的跨包复用资源。
- 功能包继续使用 `packAllAssets=true`、`autoLoad=false`，Spine 相关文件保持同目录。

## Evidence

源资产 UUID/引用、资源布局、发布收集及 Headless Chromium 均已验证。

## Re-evaluate when

目标小游戏平台、远程包部署或实际功能依赖要求改变包边界时。
