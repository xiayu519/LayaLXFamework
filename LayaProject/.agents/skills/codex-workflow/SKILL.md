---
name: codex-workflow
description: 创建、拆分、审查或验证本项目的 AGENTS.md、.codex 配置、项目 Skill、语义路由评测和 token 预算时使用；游戏业务代码与普通文档不触发。
---

# Codex Workflow

1. 先读 [workflow-rules.md](references/workflow-rules.md)，再检查当前 `AGENTS.md`、`.codex/config.toml` 和相关 Skill。
2. `AGENTS.md` 只保留跨任务稳定约束；任务知识放入范围最窄的 Skill。不得在 `AGENTS.md` 写 Skill 名称到任务的映射。
3. 每个 Skill 只处理一个语义边界；把主要触发条件放在 `description` 开头，并写清最容易误触发的相邻边界。
4. 主文件保持短小；仅把复杂且按需使用的知识放入 `references/`，确定性检查放入 `scripts/`。
5. 任务中收到开发者纠正时立即重判语义边界；触及共享工作流则停止该边界写入并重新对齐，验证后再沉淀长期纠正。
6. 工作流改动后运行 `npm run check:skills`、`npm run check:memory` 和 `npm run test:skill-routing`。评测必须在当前项目以 `codex exec --ephemeral --sandbox read-only` 原地执行。
