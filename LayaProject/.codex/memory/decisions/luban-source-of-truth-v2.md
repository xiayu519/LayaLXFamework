---
type: decision
scope: game-config
description: 外层 Design 是 Luban 人工源，固定版本生成 TypeScript-bin；启动必需二进制进入 bootstrap，框架只公开泛型 LX.Config。
trigger: 增删配置表、升级 Luban、修改生成路径或配置运行时入口时
status: active
last_verified: 2026-09-04
source: user-confirmed
---

# Luban source of truth v2

替代 [旧版决定](luban-source-of-truth.md)。

## Decision

人工源为 `Design/config/*.xlsx`，工具固定在 `Design/tools/Luban` 并由 `LUBAN_VERSION` 锁定。生成物为 `src/game/generated/config/schema.ts` 与首次交互前必需的 `assets/bootstrap/config/game/*.bin`；陈旧检查在系统临时目录重生成，不复制项目。具体 `Tables` 留在 game，framework 仅提供 `ConfigRegistry`。

## Consequences

提交源表、生成物和确定性 `.meta`；禁止手改生成 schema，禁止运行时 ByteBuf 引入 Node `buffer`。需要延迟加载的大型业务表应进入所属功能包，不能继续扩大 bootstrap。

## Re-evaluate when

启动不再需要当前表、业务表体积需要功能化拆分，或目标平台无法支持当前 TypeScript-bin 模板时。
