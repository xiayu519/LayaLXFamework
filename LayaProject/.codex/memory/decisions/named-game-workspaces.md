---
type: decision
scope: codex-workflow
description: logic 是可调用脚本库；仅在用户明确开始并命名业务后创建英文 game 目录及独立 Codex 层。
trigger: 开始新业务、创建游戏目录、调整 logic 所有权、添加游戏 AGENTS/Skills/memory 或检查跨游戏依赖时
status: active
last_verified: 2026-09-05
source: user-confirmed
---

# Named game workspaces

## Context

`src/game/logic` 曾从 sample 验收目录演变为默认游戏作用域，导致固定脚本库、具体产品目录和 Codex 游戏层混为一体。开发者明确纠正：logic 只提供可调用脚本，具体游戏必须等用户开始业务并给出名称后再创建。

## Decision

- `src/game/logic/` 必须保留，但不是游戏目录，不放游戏专属 `AGENTS.md`、Skills 或 memory。
- 用户明确开始业务并提供名称后，Codex 将名称整理为英文 lowercase kebab-case；用 `game:create -- --name <原名> --id <english-id>` 创建 `src/game/<english-id>/` 及其独立 Codex 层。
- 命名游戏可以依赖 logic；logic 不得反向依赖命名游戏，两个命名游戏也不得互相依赖。`src/game/bootstrap` 是唯一可选择具体组合的桥接层。
- 未收到开始业务的明确请求时，不预建、猜测或复用 `logic` 作为游戏身份。

## Consequences

模板在尚未接入命名游戏时仍可通过 bootstrap 调用 logic 保持可运行。具体游戏开始后再显式接管启动、配表和验收配置。

## Re-evaluate when

产品确定只会有一个固定且已命名的游戏，或多个游戏确实需要新的稳定共享业务层时。
