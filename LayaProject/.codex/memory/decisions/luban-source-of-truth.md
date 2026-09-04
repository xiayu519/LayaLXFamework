---
type: decision
scope: game-config
description: 外层 Design 是 Luban 人工源，固定版本生成 TypeScript-bin；框架只公开泛型 LX.Config，不依赖业务表结构。
trigger: 增删配置表、升级 Luban、修改生成路径或配置运行时入口时
status: superseded
last_verified: 2026-09-04
source: user-confirmed
---

# Luban source of truth

已由 [Luban source of truth v2](luban-source-of-truth-v2.md) 替代；新版本把启动必需二进制迁入 `assets/bootstrap`。

## Context

配置既要适合小团队审查，也要在 Laya 发布包和浏览器/小游戏运行时可靠读取。

## Decision

人工源为 `Design/config/*.xlsx`，工具固定在 `Design/tools/Luban` 并由 `LUBAN_VERSION` 锁定。生成物为 `src/game/generated/config/schema.ts` 与 `assets/config/game/*.bin`；陈旧检查在系统临时目录重生成，不复制项目。具体 `Tables` 留在 game，framework 仅提供 `ConfigRegistry`。

## Consequences

提交源表、生成物和稳定 `.meta`；禁止手改生成 schema，禁止运行时 ByteBuf 引入 Node `buffer`。

## Re-evaluate when

目标平台无法支持当前 TypeScript-bin 模板，或团队统一迁移配置格式时。
