---
name: codex-workflow
description: 创建、拆分、审查或验证本项目的 AGENTS.md、.codex 配置、项目 Skill、语义路由评测和 token 预算时使用；游戏业务代码与普通文档不触发。
---

# Codex Workflow

1. 先读 [references/workflow-rules.md](references/workflow-rules.md)，再检查 `AGENTS.md`、`.codex/config.toml` 和相关 Skill。
2. `AGENTS.md` 只放跨任务稳定约束，不写 Skill 名称到任务的映射。领域知识放入语义最窄的 Skill。
3. Skill `description` 先写正向触发，再写最易混淆的排除边界；一个 Skill 只处理一个独立风险边界。
4. 主文件保持短小；按需知识放 `references/`，确定性工具放 `scripts/`。删除过期规则，不保留“当前没有什么”的说明。
5. 收到开发者纠正时重判语义边界；涉及共享工作流先暂停写入并重新对齐，验证后再写项目记忆。
6. 工作流改动运行 `npm run check:skills`、`npm run check:memory` 和 `npm run test:skill-routing`。评测用一次原地、ephemeral、read-only 调用，模型默认读取 `.codex/config.toml`；同时覆盖正向/负向路由及批准、只读、越界等决策。分类通过不等于真实任务执行通过，复杂变更补独立执行审查。
