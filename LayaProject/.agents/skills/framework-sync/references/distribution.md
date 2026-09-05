# Framework Distribution

`framework.manifest.json` 是上游发行边界；根 `.framework-lock.json` 是下游消费模式标记，并锁定 repository、来源模式与 ref、commit、manifest 和每个 managed file 的哈希。

## 上游

- 无 `.framework-lock.json`，`npm run check:framework-integrity` 校验 manifest 和共享 JSON 契约。
- 完整验证通过并提交后才创建不可变 SemVer Tag。
- 日常已提交改动无需发布 Tag；需要开发联调时由下游显式同步 channel snapshot，lock 固定当时的 commit。
- framework、公共资产、工具、测试和工作流通过 manifest 发布；game、游戏启动资源、Tables、游戏设置与游戏记忆不纳入 managed paths。

## 下游

```shell
# 稳定发布
npm run framework:sync -- --ref v0.2.0

# 开发联调
npm run framework:sync -- --channel main

npm run check:framework-integrity
npm run verify
```

`npm run verify` 是不调用 Laya CLI 的同步后快速门禁；只有同步内容影响真实 Laya 发布链或准备正式发布时，再运行 `npm run test:headless` 或 `npm run verify:release`。

远程同步默认使用 manifest/lock 中的 repository，也可显式传 `--repository <url>`。`--ref` 只接受不可变 SemVer Tag；`--channel` 解析分支当前提交并作为 snapshot 锁定，分支后续推进不会改变已有 lock。受控本地联调可用 `--source <上游仓库>` 搭配其中任一来源参数；工具会验证本地 HEAD 与所选 ref 一致且工作区干净。

同步必须在独立 `sync/framework-x.y.z` 或 `sync/framework-main-<date>` 分支执行。若 manifest 的 npm 契约发生变化，在该分支更新 `package-lock.json`，再进行游戏专项回归。`CODEOWNERS` 和分支保护必须要求框架负责人审查 managed paths、manifest 与 lock；CI 负责拒绝缺失、新增和哈希变化。

CI 还执行 `npm run check:framework-upstream`：release lock 从 Tag 校验，snapshot lock 从记录的 channel 历史检出已锁定 commit，再逐项核对；因此上游继续推进不会使旧 snapshot 失效，同时伪造本地文件和 lock 也不能通过。channel 必须禁止 force-push，确保旧 commit 仍可达。上游仓库没有 lock 时该检查直接跳过，不访问网络。
