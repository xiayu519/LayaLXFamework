---
name: codex-workflow
description: 创建、拆分、审查或验证本项目的 AGENTS.md、.codex 配置、项目 Skill、语义路由评测和 token 预算时使用；游戏业务代码与普通文档不触发。
---

# Codex Workflow

1. 先读 [references/workflow-rules.md](references/workflow-rules.md)，再检查 `AGENTS.md`、`.codex/config.toml` 和相关 Skill。
2. 从实际任务判断每条指令是否改变决策；保留领域不变量，删除重复通用步骤。按需知识放 `references/`，重复且确定的操作放 `scripts/`。
3. 同步修改规则的真实消费者：游戏模板、检索、评测与开发文档。验收报告保留当时基线；项目记忆按其 policy 清除过时或重复内容。
4. 按 reference 的验证条件检查；涉及模型或执行语义时读 [evaluation.md](references/evaluation.md)。交付实际行为证据，分类成绩不能代替执行结果。
