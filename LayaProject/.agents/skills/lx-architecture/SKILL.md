---
name: lx-architecture
description: 设计共享架构、lx 公共入口、服务契约、模块边界、启动顺序与失败回滚时使用；仅位于 src/framework 的单一功能内部修复及未证明应公共化的业务候选不触发。
---

# lx Architecture

1. 先读 [architecture.md](references/architecture.md)，再检查受影响模块及其测试。
2. 稳定复用的公共能力放在 `src/framework/`，具体游戏业务放在 `src/game/`；framework 不得依赖 game。各自的 domain/application 不得依赖 `Laya`、DOM 或平台全局。
3. 业务组合根位于 `src/game/<id>/bootstrap/`，提供 ApplicationConfig，由 lx.init 调用。仅在真实替换或隔离需求存在时新增接口。
   下游共享改动按根 AGENTS 先确认实施位置；开发者已选择当前项目时直接在批准范围实施，不再以 managed paths 为由拒绝。
4. 命名按 [代码约定](../../../docs/code-style.md)；lx 直接持有模块，初始化集中在 lx.ts，不另建 Runtime/Host/Facade。启动必须有确定顺序，失败逆序回滚。
5. 用 `npm run check:architecture` 验证依赖边界；契约变更增加消费者与失败回滚回归，按批准的 Change Contract 验收。
