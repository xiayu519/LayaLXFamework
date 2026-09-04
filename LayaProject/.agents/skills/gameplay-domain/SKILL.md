---
name: gameplay-domain
description: 实现不依赖引擎的游戏规则、状态机、数值、关卡进度、冷却与确定性时间逻辑时使用；UI、资源、网络、存档和平台接入不触发。
---

# Gameplay Domain

1. 当前游戏规则放在 `src/game/domain/`，用例编排放在 `src/game/application/`；只有已证明跨业务稳定的纯原语才进入 `src/framework/domain/`。
2. 逻辑必须由输入、状态和显式 elapsed time 重放，不直接读取 `Laya.timer`、系统时钟、DOM、存储或网络。
3. 固定步长、暂停、追帧上限或服务器时钟偏移必须由真实需求定义；在 game 层建立最小模型并注入时间，不预建公共 Clock 类。
4. 优先小型组合对象和显式状态转换，不为尚不存在的规模引入全量 ECS。
5. `StateMachine` guard 只命中一个转换，effect 成功后才提交状态，并拒绝非法、歧义和重入转换。
6. 补边界值、非法转换、重复调用和时间推进单测，运行 `npm run typecheck && npm test && npm run check:architecture`。
