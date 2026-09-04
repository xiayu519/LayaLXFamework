# Workflow rules

## Source hierarchy

1. 当前用户目标与明确约束。
2. 当前目录生效的 `AGENTS.md`。
3. 被语义触发 Skill 的 `SKILL.md`，再按任务需要读取其 reference。
4. 现有代码、测试、本地引擎声明与目标平台官方文档。
5. 外部参考项目只提供可选择的模式，不覆盖本项目已验证的 LayaAir 3.4.1 本土化行为。

## 精度与 token 预算

- 指令只写一次，放在最接近其作用域的位置。
- `AGENTS.md` 目标不超过 2048 bytes；项目 Skill `description` 总量不超过 2500 字符。
- 描述先写主要使用场景，再写最重要的相邻排除项；不依赖关键词表或显式名称调用。
- 主 Skill 只包含执行路径；详细领域知识、模板和确定性工具分别放入 `references/`、`assets/`、`scripts/`。
- 以代表性路由评测和真实任务验证调整描述，不能仅凭措辞自评。
- 主线程和任务门禁使用 `gpt-5.6-sol/high`；只有已确认边界的低风险小任务才可交给低成本执行代理，复杂决策和最终验收仍由主线程负责。

## 小团队协作

- 写入前重新读取目标文件；保留其他成员和并行任务的改动。
- 同一语义区域在检查后发生变化时停止，不自动选择一方覆盖或扩大已批准范围。
- 业务中途出现纠正或共享变更候选时重新判断边界；局部需求先留在 game，只有稳定跨业务语义才进入 framework。
- Git 分支/worktree 是并发隔离手段；`git init`、commit 和 push 仅在开发者明确要求时执行。

## 官方依据

- [OpenAI model guidance](https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6)：保持提示精简、避免重复，并以 eval 验证质量。
- [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)：按目录层级加载项目指令。
- [Codex Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)：项目或 Skill 可触发子代理，并为不同任务指定模型与 reasoning。
- [Codex Build Skills](https://learn.chatgpt.com/zh-Hant/docs/build-skills)：先加载名称与描述，语义命中后再读取完整 Skill。

外部工作流参考：`D:\gitframework\Tyou`。领域设计参考：`D:\layapro\esengine` 与 `D:\layapro\GameFrameX.LayaBox`。整合时只提取经当前项目需求证明有用的边界与流程，不复制框架层或引擎封装。
