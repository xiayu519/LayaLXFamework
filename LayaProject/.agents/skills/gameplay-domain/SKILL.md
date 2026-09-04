---
name: gameplay-domain
description: 实现不依赖引擎的游戏规则、状态机、数值、关卡进度、冷却与确定性时间逻辑时使用；UI、资源、网络、存档和平台接入不触发。
---

# Gameplay Domain

1. 当前游戏规则放在 `src/game/domain/`，用例编排放在 `src/game/application/`；已证明跨业务稳定的纯原语才进入 `src/framework/domain/`。
2. 逻辑必须可由输入、状态和显式时间重放，不直接读取 `Laya.timer`、系统时钟、DOM、存储或网络。
3. 显式模拟时间使用 `SimulationClock`；需要固定步长时另行实现 accumulator 与追帧上限。服务器时间使用注入后的 `ServerClock`，并明确暂停与时钟偏移边界。
4. 优先小型组合对象与显式状态转换；不要为尚未存在的实体规模引入全量 ECS。
5. 通用 `StateMachine` 的 guard 必须唯一命中；effect 成功后才提交状态，并拒绝非法、歧义与重入转换。
6. 为边界值、非法转换、重复调用和时间推进补单元测试，然后运行 `npm run typecheck && npm test && npm run check:architecture`。
