# Framework Distribution

`framework.manifest.json` 是上游发行边界；根 `.framework-lock.json` 是下游消费模式标记，并锁定 repository、Tag、commit、manifest 和每个 managed file 的哈希。

## 上游

- 无 `.framework-lock.json`，`npm run check:framework-integrity` 校验 manifest 和共享 JSON 契约。
- 完整验证通过并提交后才创建不可变 SemVer Tag。
- framework、公共资产、工具、测试和工作流通过 manifest 发布；game、游戏启动资源、Tables、游戏设置与游戏记忆不纳入 managed paths。

## 下游

```shell
npm run framework:sync -- --ref v0.2.0
npm run check:framework-integrity
npm run verify
```

远程同步默认使用 manifest/lock 中的 repository，也可显式传 `--repository <url>`。受控本地联调可用 `--source <上游仓库> --ref <已检出的Tag>`；工具会验证本地 HEAD 与 ref 一致。

同步必须在独立 `sync/framework-x.y.z` 分支执行。若 manifest 的 npm 契约发生变化，在该分支更新 `package-lock.json`，再进行游戏专项回归。`CODEOWNERS` 和分支保护必须要求框架负责人审查 managed paths、manifest 与 lock；CI 负责拒绝缺失、新增和哈希变化。

CI 还执行 `npm run check:framework-upstream`，从 lock 的 Tag 读取上游提交并逐项核对；因此同时伪造本地文件和 lock 也不能通过。上游仓库没有 lock 时该检查直接跳过，不访问网络。
