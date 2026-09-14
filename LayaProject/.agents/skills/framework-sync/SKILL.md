---
name: framework-sync
description: 在下游游戏仓库锁定、同步或校验 LayaLXFamework 发布版本，或处理 framework manifest、lock 与完整性 CI 时使用；框架内部实现和普通 Git 合并不触发。
---

# Framework Sync

1. 先读 [distribution.md](references/distribution.md)，确认当前仓库是无 lock 的上游还是有 lock 的下游。
2. 下游涉及框架类型、公共功能或共享契约时，先说明改动与影响，让开发者选择在上游分支实施还是直接修改当前项目；已有选择覆盖的范围不重复询问。选择当前项目后允许改 managed files，lock 继续记录上次同步来源。
3. 同步前列出与目标版本重叠的本地改动，包括已提交的修改；先保留或合并。只有开发者确认替换已列明内容时才使用 --overwrite-local。同步后审查差异，按 reference 验证。
4. 本地增删改只报告差异，不阻止继续开发；来源校验仍核对 lock 与真实上游提交，不能把改写哈希当成已同步。最低引擎/类型契约继续验证。
