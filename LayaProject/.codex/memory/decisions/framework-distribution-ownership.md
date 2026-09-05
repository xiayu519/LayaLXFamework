---
type: decision
scope: framework-distribution
description: 上游用 manifest 发布公共框架，下游用版本 lock 和完整性 CI 只读消费，所有公共修改回流上游。
trigger: 创建下游游戏仓库、同步框架版本、修改发行边界，或发现下游 framework 差异时。
status: superseded
last_verified: 2026-09-05
source: code-verified
---

# Framework distribution ownership

Superseded by [Framework distribution channels](framework-distribution-channels.md).

## Decision

- 无 `.framework-lock.json` 是上游模式；存在 lock 是下游模式，禁止手改 managed files 和 lock。
- `framework.manifest.json` 管理 framework 源码、框架启动资产、公共工具、测试、文档、AGENTS、Skills 与公共记忆；game、游戏资源、Tables 和游戏记忆归下游。
- `src/Main.ts` 是稳定外壳；下游桥接到 `src/game/<game-id>/bootstrap/createGameApplication.ts`，framework 不依赖 game。
- 下游只同步上游验证过的 SemVer Tag；lock 记录 repository、Tag、commit、manifest 和逐文件哈希，并由 CI、CODEOWNERS 与分支保护共同执行。

## Evidence

专项测试已覆盖正常同步、受管文件篡改失败和重新同步恢复；类型、架构、资源与 LayaAir 3.4.1 原地 Headless 发布通过。

## Re-evaluate when

框架拆为独立 npm/Laya package，或 Git 托管不再支持现有 Tag、CODEOWNERS 和分支保护流程时。
