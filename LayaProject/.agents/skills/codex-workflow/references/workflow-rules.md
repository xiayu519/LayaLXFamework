# Workflow Rules

## Source order

1. 当前用户目标与明确约束。
2. 当前目录生效的 `AGENTS.md`。
3. 语义命中的最窄 Skill；只读任务所需 reference。
4. 当前代码、测试、本地固定版本源码与官方文档。
5. 外部参考只提供候选模式，不覆盖已验证的 LayaAir 3.4.1 本地行为。

## Precision and token budget

- 规则只写一次，放在最近作用域。
- `AGENTS.md` 不超过 2048 bytes；Skill description 总计不超过 2500 字符。
- 不使用关键词表或硬编码路由；以代表性语义 eval 验证 description。
- 主线和质量门禁为 `gpt-5.6-sol/high`。明确、低风险小任务可用 `sol/medium` 或 `terra/medium`，公共契约与最终验收不降级。
- 静态检查可并行；一次完整发布验证足够，不重复无相关变化的通过项。

## Collaboration

- 写前重读目标，保留其他成员改动；检测到同一区域并发变化就停止报告。
- 公共候选先证明跨业务复用、稳定语义、Laya 无等价能力、失败边界与验证；否则留在 game。
- 新游戏用 `src/game/<game-id>/AGENTS.md` 与该目录 `.agents/skills/` 追加专属规则；从游戏目录启动时，AGENTS 从根向下叠加，公共与游戏 Skills 从当前目录向根同时发现。根目录启动不加载游戏层。
- 游戏层不复制公共规则且 Skill 不与公共层重名；生成与发现规则由 `npm run validate:game-workflow` 检查。
- Git 操作仅在开发者明确要求时执行。

## References

- OpenAI GPT-5.6 Prompt Guidance: https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6
- Codex AGENTS.md: https://developers.openai.com/codex/guides/agents-md#layer-project-instructions
- Tyou workflow: `D:\gitframework\Tyou\Books\AI-Development-Workflow.md`
- Domain references: `D:\layapro\esengine`, `D:\layapro\GameFrameX.LayaBox`
