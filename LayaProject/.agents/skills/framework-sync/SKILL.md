---
name: framework-sync
description: 在下游游戏仓库锁定、同步或校验 LayaLXFamework 发布版本，或处理 framework manifest、lock 与完整性 CI 时使用；框架内部实现和普通 Git 合并不触发。
---

# Framework Sync

1. 先读 [distribution.md](references/distribution.md)，确认当前仓库是无 lock 的上游还是有 lock 的下游。
2. 下游不得手改 managed files 或 `.framework-lock.json`；框架缺口反馈上游，待上游验证和发布 Tag 后同步。
3. 同步前确认业务工作区没有与 managed paths 重叠的未提交改动；同步后审查变更，更新 npm lock（如需要），再执行完整验证和游戏回归。
4. 完整性失败只通过批准的版本同步恢复，不用改哈希或缩小 manifest 绕过。
