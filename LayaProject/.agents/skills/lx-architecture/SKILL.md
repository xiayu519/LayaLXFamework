---
name: lx-architecture
description: 判断业务 World 划分，或设计共享架构、lx 入口、模块归属、启动顺序与失败回滚时使用；已有归属的局部 UI/Scene 修复及未证明应公共化的候选不触发。
---

# lx Architecture

1. World 划分与内容归属先读 [归属判定](../../../docs/ownership-decisions.md)；共享入口、依赖或启动设计读 [architecture.md](references/architecture.md)。按问题读取，再检查消费者及测试，不默认加载全部架构说明。
2. 稳定复用的公共能力放在 `src/framework/`，具体游戏业务放在 `src/game/`；framework 不得依赖 game。各自的 domain/application 不得依赖 `Laya`、DOM 或平台全局。
3. 业务组合根位于 `src/game/<id>/bootstrap/`，提供 ApplicationConfig，由 lx.init 调用。仅在真实替换或隔离需求存在时新增接口。
   下游共享改动按根 AGENTS 先确认实施位置；开发者已选择当前项目时直接在批准范围实施，不再以 managed paths 为由拒绝。
4. 命名按 [代码约定](../../../docs/code-style.md)；lx 直接持有模块，初始化集中在 lx.ts，不另建 Runtime/Host/Facade。启动必须有确定顺序，失败逆序回滚。
5. 只读设计不运行构建；代码依赖变化用 `npm run check:architecture`，契约变化验证消费者与失败边界；其余按根 AGENTS 选择最小相关验收。
