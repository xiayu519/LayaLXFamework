---
type: decision
scope: game-data
description: 普通或编辑器 JSON 与 Luban Tables 是独立数据链，分别由 LX.Config 和 LX.Tables 管理。
trigger: 接入 JSON、地图数据、Luban 表，或修改数据目录、加载入口和释放策略时
status: superseded
last_verified: 2026-09-05
source: user-confirmed
---

# Data pipelines v3

替代 [Luban source of truth v2](luban-source-of-truth-v2.md)。

已由 [Data pipelines v4](data-pipelines-v4.md) 替代；新版本把生成位置放入游戏配置，并采用独立 game bootstrap 作用域。

## Decision

- 外部游戏、地图编辑器和业务 JSON 按用途进入 `config/`、`data/`、`maps/` 或 `levels/`，注册为 `ContentCatalog` 的 `data` 条目，并由 `LX.Config` 加载、校验和释放。
- Luban 人工源为 `Design/Tables/*.xlsx`；固定工具生成 `src/game/generated/tables/schema.ts` 与 `assets/bootstrap/tables/game/*.bin`，运行时只通过 `LX.Tables` 暴露。
- 两条链互不触发，framework 不依赖具体 JSON schema 或 Luban 表结构。

## Consequences

JSON 不经过 Luban。Tables 任务提交源表、生成物和确定性 `.meta`；JSON 与 Tables 的 owner 在停机时分别清理 Laya Loader 缓存。

## Re-evaluate when

具体游戏需要流式地图格式、远程版本化数据，或大型 Tables 必须迁出 bootstrap 时。
