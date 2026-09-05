---
type: decision
scope: sample-game
description: sample 只作为上游框架验收游戏，属于 game 所有权，不进入下游受保护发行文件。
trigger: 追溯旧 sample 组合、启动 UI、测试数据或原发行边界时。
status: superseded
last_verified: 2026-09-05
source: user-confirmed
---

# Sample ownership

Superseded by [Logic ownership](logic-ownership.md).

`src/game/sample` 与 `assets/bootstrap/game` 曾用于验证公共框架，但仍属于具体游戏内容。当前固定真实业务根已调整为 `src/game/logic`。
