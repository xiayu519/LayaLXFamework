---
type: problem
scope: laya-bootstrap-package
description: 仅关闭 alwaysIncludeDefaultSkin 仍可能把 ui2 默认滚动条、弹窗和提示皮肤打进首包；相关 PlayerSettings 引用必须显式置空。
trigger: 首包出现未引用的 internal/UI、comp.atlas 或默认 ui2 皮肤时
status: active
last_verified: 2026-09-04
source: code-verified
---

# ui2 default skins entered the bootstrap package

## Reproduction

`UI.alwaysIncludeDefaultSkin=false`，但未覆盖默认滚动条、弹窗和提示资源时，LayaAir 3.4.1 Web 构建仍生成 `release/web/internal/UI`，发布目录为 1,994,585 字节。

## Root cause and fix

`horizontalScrollBar`、`verticalScrollBar`、`popupMenu` 与 `tooltipsWidget` 的默认引用仍参与启动资源收集。将四项显式设为 null，业务 `.lh` 自己引用所属包资源。

## Verification

当时原地重新构建后 `release/web/internal/UI` 不再存在，发布目录降为 1,654,886 字节，并通过产物检查和 Headless Chromium。现行配置见 [PlayerSettings.json](../../../settings/PlayerSettings.json)，验收入口按 [当前验证规则](../../../AGENTS.md) 选择；历史包体大小不作为当前预算或通过证据。
