# logic

本文件只补充当前游戏逻辑规则。从本目录启动 Codex 时，项目根公共规则先加载，本文件随后叠加；公共与游戏 Skills 同时参与语义匹配。

`src/game/logic` 是当前产品的真实业务根，可由下游持续修改但不得删除。玩法、组合、JSON、Luban Tables 和 UI 实现留在本目录；游戏经验写入本目录 `.codex/memory/`，不污染公共框架记忆。
