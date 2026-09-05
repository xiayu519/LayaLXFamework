---
type: decision
scope: logic-game
description: src/game/logic 是当前产品必须保留的真实业务根，由下游维护且不进入框架受保护发行文件。
trigger: 修改游戏组合、业务逻辑、启动 UI、测试数据或判断某项内容是否应随框架同步时。
status: active
last_verified: 2026-09-05
source: user-confirmed
---

# Logic ownership

`src/game/logic` 与 `assets/bootstrap/game` 是当前产品的真实业务内容。框架发行 manifest 不管理这些路径，因此下游可以持续修改；`doctor` 根据 `settings/GameProject.json` 要求业务根、AGENTS、组合入口及生成路径存在，不允许删除后继续通过验收。
