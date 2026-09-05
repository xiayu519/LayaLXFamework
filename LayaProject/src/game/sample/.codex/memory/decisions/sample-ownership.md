---
type: decision
scope: sample-game
description: sample 只作为上游框架验收游戏，属于 game 所有权，不进入下游受保护发行文件。
trigger: 修改 sample 组合、启动 UI、测试数据或判断某项内容是否应随框架同步时。
status: active
last_verified: 2026-09-05
source: user-confirmed
---

# Sample ownership

`src/game/sample` 与 `assets/bootstrap/game` 用于验证公共框架，但仍是具体游戏内容。框架发行 manifest 不管理这些路径；真实下游用自己的 game 组合、资源和验收配置替换它们。
