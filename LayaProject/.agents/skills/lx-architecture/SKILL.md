---
name: lx-architecture
description: 设计共享架构、lx 公共入口、服务契约、模块边界、启动顺序与失败回滚时使用；仅位于 src/framework 的单一功能内部修复及未证明应公共化的业务候选不触发。
---

# lx Architecture

1. 先读 [architecture.md](references/architecture.md)，再检查受影响模块及其测试。
2. 多人共享能力放在 `src/framework/`，具体游戏业务放在 `src/game/`；framework 不得依赖 game。各自的 domain/application 不得依赖 `Laya`、DOM 或平台全局。
3. 业务组合根位于 `src/game/<id>/bootstrap/`，通过 framework runtime 定义显式组装。仅在真实替换或隔离需求存在时新增接口。
4. 命名按 [代码约定](../../../docs/code-style.md)；运行时只暴露 `lx`；绑定与解绑留在 framework bootstrap 内部。启动必须有确定顺序，失败逆序回滚。
5. 用 `npm run check:architecture` 验证依赖边界；契约变更增加消费者与失败回滚回归，按批准的 Change Contract 验收。
