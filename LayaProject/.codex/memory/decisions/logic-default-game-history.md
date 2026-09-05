---
type: decision
scope: game-ownership-history
description: sample 后曾将 logic 设为默认真实游戏及私有 Codex 作用域，该决定已被命名游戏工作区替代。
trigger: 追溯 sample、logic 默认游戏、旧 GameProject.gameId 或旧 logic 私有记忆时
status: superseded
last_verified: 2026-09-05
source: user-confirmed
---

# Logic default game history

Superseded by [Named game workspaces](named-game-workspaces.md).

`src/game/sample` 曾作为框架验收游戏，随后被迁移到必须保留的 `src/game/logic`，并一度把 logic 视为下游可编辑的默认真实业务根，附带自己的 `AGENTS.md` 与 `.codex/memory/`。开发者随后明确：保留要求只针对可调用 logic 脚本库，不能把 logic 当作玩家新游戏或 Codex 游戏作用域。
