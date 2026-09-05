---
type: decision
scope: codex-workflow
description: 每个游戏在 src/game/<game-id> 追加自己的 AGENTS.md 和 Skills，并从该目录启动 Codex 以叠加公共工作流。
trigger: 创建新游戏、添加游戏专属规则或 Skill，或排查公共与游戏工作流加载范围时
status: superseded
last_verified: 2026-09-05
source: external-verified
---

# Game workflow layering

Superseded by [Named game workspaces](named-game-workspaces.md).

## Context

小团队需要公共框架规则持续生效，同时避免单个游戏的稳定约束污染其他游戏或公共工作流。

## Decision

旧决定曾把必须保留的 `src/game/logic` 当作默认真实业务根，并从该目录叠加游戏规则和记忆；这部分语义已经废止。

旧命令仅接收 `--id <game-id>` 创建游戏作用域。现行命令和触发条件见 [Named game workspaces](named-game-workspaces.md)。

## Evidence

OpenAI 官方 Codex 文档确认 AGENTS 从项目根向当前目录合并，Skills 从当前目录向仓库根扫描。项目的 `validate:game-workflow`、`check:skills` 和 30 项语义路由评测均已通过。

## Re-evaluate when

Codex 官方更改 AGENTS/Skills 发现规则，或仓库不再以 `LayaProject` 作为公共工作目录时。
