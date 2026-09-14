# Framework Distribution

`framework.manifest.json` 是上游发行边界；根 `.framework-lock.json` 是下游消费模式标记，并锁定 repository、来源模式与 ref、commit、manifest 和每个 managed file 的哈希。

## 上游

- 无 `.framework-lock.json`，`npm run check:framework-integrity` 校验 manifest 和共享 JSON 契约。
- 完整验证通过并提交后才创建不可变 SemVer Tag。
- 日常已提交改动无需发布 Tag；需要开发联调时由下游显式同步 channel snapshot，lock 固定当时的 commit。
- framework 代码、工具、测试和工作流通过 manifest 发布；game、全部 bootstrap 启动资源、功能资源、Tables、游戏设置、游戏记忆与 `.github/CODEOWNERS` 不纳入 managed paths。Startup/Tip/Loading 随完整项目模板提供，由游戏维护；同步不得覆盖。旧 lock 退出管理的运行时资产保留，目录和引用由游戏迁移，不能按过期文件删除。

## 下游

```shell
# 稳定发布
npm run framework:sync -- --ref v0.2.0

# 开发联调
npm run framework:sync -- --channel main

npm run check:framework-integrity
```

每次同步必跑 `check:framework-integrity`。仅说明/工作流变化按对应规则验证；运行时代码变化加类型检查和受影响游戏测试；跨模块或依赖更新用 `verify`。真实引擎语义变化按 [Headless 范围](../../laya-headless/references/verification.md) 验证，发布链变化或正式发布用 `verify:release`；完整发布验收已含完整性与快速检查时不先重复跑 `verify`。

远程同步默认使用 manifest/lock 中的 repository，也可显式传 `--repository <url>`。`--ref` 只接受不可变 SemVer Tag；`--channel` 解析分支当前提交并作为 snapshot 锁定，分支后续推进不会改变已有 lock。受控本地联调可用 `--source <上游仓库>` 搭配其中任一来源参数；工具会验证本地 HEAD 与所选 ref 一致且工作区干净。

涉及框架类型或公共功能时，先让开发者选择上游分支或当前项目；已有同范围选择不重复确认。选择当前项目后允许修改 managed files，lock 继续记录来源基线。`check:framework-integrity` 将本地修改、新增、删除和 manifest 差异作为提示，退出成功；仍验证必要 JSON 契约与 lock 格式。

同步可以使用独立 `sync/framework-x.y.z` 或 `sync/framework-main-<date>` 分支，便于审查与回退。若 npm 契约变化，更新 `package-lock.json` 并验证相关游戏功能。同步会在写入前列出将覆盖的本地差异；开发者选择保留并合并，或明确替换后传 `--overwrite-local`，不因修改已经提交而静默覆盖。`.github/CODEOWNERS` 不再分发，旧 lock 持有的该文件保留并移交游戏；下游自行决定审查配置和分支保护。

唯一的 GitHub Workflow 还执行 `npm run check:framework-upstream`：release lock 从 Tag 校验，snapshot lock 从记录的 channel 历史检出已锁定 commit，再逐项核对；因此上游继续推进不会使旧 snapshot 失效，本地修改不影响来源核对，伪造 lock 中的来源仍不能通过。channel 应保留已发布 commit 的可达性，避免改写历史。上游仓库没有 lock 时该检查直接跳过，不访问网络。
