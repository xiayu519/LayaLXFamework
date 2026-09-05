# 框架发行与下游同步

## 所有权

仓库根没有 `.framework-lock.json` 时是上游开发模式；存在 lock 时是下游消费模式。下游不得直接修改 `framework.manifest.json` 管理的文件。

| 上游管理 | 下游管理 |
| --- | --- |
| `src/framework/**`、`src/Main.ts` | `src/game/**` |
| `assets/bootstrap/framework/**` | `assets/bootstrap/game/**`、`assets/packages/**`、`assets/shared/**` |
| 根 `.agents/**`、`.codex/**`、`AGENTS.md` | `src/game/<game-id>/AGENTS.md`、`.agents/**`、`.codex/memory/**` |
| `tools/**`、`tests/framework/**`、`tests/workflow/**` | `tests/game/**`、游戏专属工具 |
| `Design/tools/**`、`Design/genBin.*` | `Design/Tables/**` |

`package.json`、`LayaProject.laya`、`PlayerSettings.json`、`ResourceLayout.json` 和 `tsconfig.json` 归下游维护，但 manifest 会校验框架依赖的最小 JSON 字段；下游可添加游戏字段，不能删除或改写公共契约。

## 启动扩展点

```text
src/Main.ts
  -> src/game/bootstrap/createApplication.ts
  -> src/game/logic/bootstrap/createGameApplication.ts
  -> src/framework/bootstrap/createRuntime.ts
```

`Main.ts` 只处理 Laya Script 的启动、停止和失败回滚。固定桥接与具体游戏组合都归下游；framework 不依赖 game。

## 发布与同步

正式发布时，上游完成 `npm run verify:release`、提交并创建不可变 SemVer Tag。下游只在独立同步分支执行：

```shell
git switch -c sync/framework-0.2.0
cd LayaProject
npm run framework:sync -- --ref v0.2.0
npm run check:framework-integrity
npm run verify
```

开发期不需要为每批提交创建 Tag。需要联调最新 `main` 时，下游执行：

```shell
git switch -c sync/framework-main-20260905
cd LayaProject
npm run framework:sync -- --channel main
npm run check:framework-integrity
npm run verify
```

这里的 `verify` 是无 Laya CLI 的快速门禁。只有同步内容影响运行时、资源或发布构建时，才追加一次 `npm run test:headless`；上游正式发布使用 `npm run verify:release`。

同步工具从 manifest 复制发行文件，更新 `.framework-lock.json` 中的 repository、来源模式与 ref、commit、manifest 哈希及逐文件 SHA-256，并合并最小 JSON 契约。release 模式锁定 Tag；snapshot 模式在同步时解析 channel 最新提交并固定该 commit，channel 后续推进不会改变已有下游。若 npm 契约变化，下游在同步分支更新 `package-lock.json`。游戏回归通过后才合并主分支。

第一次建立下游仓库时仍建议从一个已发布 Tag 创建完整项目并设置自己的 `origin`，再对同一 Tag 执行一次 `framework:sync` 生成初始 lock。之后可以同步更高的已发布版本，也可以按需显式更新 `main` snapshot；下游不会在上游 push 时自动漂移。

本地文件仍可被编辑，但受管文件与 lock 不一致会被离线完整性检查拒绝；CI 还通过 `npm run check:framework-upstream` 对照 lock 指向的真实 Tag 或 channel 历史中的固定 commit，因此同时伪造文件与 lock 也会失败。用于 snapshot 的 channel 必须禁止 force-push，仓库必须启用分支保护并要求 `CODEOWNERS` 审查；框架缺口回到上游修复，不能修改哈希绕过。
