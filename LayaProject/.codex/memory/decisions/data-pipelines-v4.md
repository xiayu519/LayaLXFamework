---
type: decision
scope: game-data
description: JSON 与 Luban Tables 保持独立；Luban 生成位置由当前游戏配置指定并进入 game 所有权目录。
trigger: 接入 JSON、地图数据、Luban 表，或修改 GameProject、生成路径、加载入口与释放策略时。
status: active
last_verified: 2026-09-05
source: code-verified
---

# Data pipelines v4

替代 [Data pipelines v3](data-pipelines-v3.md)。

## Decision

- 普通 JSON 按用途进入游戏 `config/data/maps/levels`，通过 `LX.Config` 加载、校验和释放，不经过 Luban。
- Luban 人工源位于 `Design/Tables`；`settings/GameProject.json` 指定 `src/game/<game-id>/generated/tables` 与 `assets/bootstrap/game/tables` 输出。
- framework 只提供通用 `LX.Config` 和 `LX.Tables`，不依赖具体 JSON schema 或 Tables 类型。

## Evidence

生成、陈旧检查、类型检查、单测及 LayaAir 3.4.1 Headless 发布包均通过。

## Re-evaluate when

游戏需要大型 Tables 延迟包、远程版本化数据或切换 Luban 输出格式时。
