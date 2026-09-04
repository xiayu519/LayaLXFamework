---
type: decision
scope: architecture
description: 共享能力位于 src/framework，具体产品业务位于 src/game；framework 不得依赖 game，运行时只公开 LX。
trigger: 新增模块、移动公共能力、修改组合根、LX 入口或 framework/game 依赖时。
status: active
last_verified: 2026-09-04
source: user-confirmed
---

# Framework/game ownership

## Decision

- `src/framework/` 保存多人共享、稳定且可验证的能力。
- `src/game/` 保存当前产品的玩法、界面、配置和业务组合。
- game bootstrap 通过 `createRuntime(definition, adapters)` 组装 framework；framework 禁止反向依赖 game。
- 业务运行时只访问 `LX`。`LXRuntimeHost` 的 bind/unbind 是 framework bootstrap 内部能力，不导出 `LXFamework` class。

## Verification

`npm run check:architecture` 检查所有权、依赖方向、内部 host 调用者与 `LX` 唯一导出；类型、单测和 Headless 发布链路负责行为验证。

## Re-evaluate when

需要拆分独立 npm package，或者出现必须跨仓库复用的稳定框架模块。
