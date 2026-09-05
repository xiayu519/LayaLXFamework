---
name: lx-architecture
description: 设计共享架构、LX 公共入口、服务契约、模块边界、启动顺序与失败回滚时使用；仅位于 src/framework 的单一功能内部修复及未证明应公共化的业务候选不触发。
---

# LX Architecture

1. 先读 [architecture.md](references/architecture.md)，再检查受影响模块及其测试。
2. 多人共享能力放在 `src/framework/`，具体游戏业务放在 `src/game/`；framework 不得依赖 game。各自的 domain/application 不得依赖 `Laya`、DOM 或平台全局。
3. 业务组合根位于 `src/game/bootstrap/`，通过 framework runtime 定义显式组装。仅在真实替换或隔离需求存在时新增接口。
4. 运行时对业务只暴露 `LX`；绑定与解绑留在 framework bootstrap 内部。启动必须有确定顺序，失败逆序回滚。
5. 修改后至少运行 `npm run typecheck`、`npm test` 和 `npm run check:architecture`；公共契约变化还需按批准的 Change Contract 验收。
