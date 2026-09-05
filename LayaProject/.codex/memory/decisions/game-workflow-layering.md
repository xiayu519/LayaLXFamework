---
type: decision
scope: codex-workflow
description: 每个游戏在 src/game/<game-id> 追加自己的 AGENTS.md 和 Skills，并从该目录启动 Codex 以叠加公共工作流。
trigger: 创建新游戏、添加游戏专属规则或 Skill，或排查公共与游戏工作流加载范围时
status: active
last_verified: 2026-09-05
source: external-verified
---

# Game workflow layering

## Context

小团队需要公共框架规则持续生效，同时避免单个游戏的稳定约束污染其他游戏或公共工作流。

## Decision

当前项目使用必须保留的 `src/game/logic` 作为默认真实业务根；从该目录启动 Codex 时叠加游戏规则和记忆。

使用 `npm run game:create -- --id <game-id>` 创建 `src/game/<game-id>/AGENTS.md` 和 `.agents/skills/`。游戏任务从该目录启动 Codex；公共 `LayaProject/AGENTS.md` 先加载，游戏文件随后叠加，公共与游戏 Skills 同时参与语义匹配。游戏 Skill 必须使用独立名称和精确 description。

## Evidence

OpenAI 官方 Codex 文档确认 AGENTS 从项目根向当前目录合并，Skills 从当前目录向仓库根扫描。项目的 `validate:game-workflow`、`check:skills` 和 30 项语义路由评测均已通过。

## Re-evaluate when

Codex 官方更改 AGENTS/Skills 发现规则，或仓库不再以 `LayaProject` 作为公共工作目录时。
