---
type: decision
scope: game-data
description: JSON 与 Luban Tables 分离；模板表逻辑默认进入 logicRoot，命名游戏可显式改为自己的生成目录。
trigger: 接入 JSON、Luban 表，或修改 GameProject logicRoot、生成路径、加载入口与释放策略时
status: active
last_verified: 2026-09-05
source: code-verified
---

# Data pipelines v5

路径曾把固定逻辑库误当成游戏身份；当前配置依据见 [GameProject.json](../../../settings/GameProject.json)。

## Decision

- 普通 JSON 按用途进入命名游戏的 `config/data/maps/levels`，通过 `LX.Config` 加载、校验和释放，不经过 Luban。
- `settings/GameProject.json` schema 2 使用 `logicRoot`，不再把 `logic` 声明为 `gameId`。模板默认将 Luban 运行支持与生成代码放入 `src/game/logic/generated`，数据进入 `assets/bootstrap/game/tables`。
- 命名游戏需要独立 Tables 类型时，在 schema 2 显式设置 `gameRoot` 并把生成代码调整到 `src/game/<game-id>/generated`；framework 仍只提供通用 `LX.Config` 和 `LX.Tables`。
- 同步后的旧下游 schema 1 `gameId` 保持兼容，避免仅更新框架工具就破坏现有项目。

## Evidence

[GameProject.test.ts](../../../tests/workflow/GameProject.test.ts) 覆盖 schema 2、旧 schema 1 和越界路径；生成与运行链路见 [Luban Skill](../../../.agents/skills/luban-tables/SKILL.md)。

## Re-evaluate when

游戏需要大型 Tables 延迟包、远程版本化数据或切换 Luban 输出格式时。
