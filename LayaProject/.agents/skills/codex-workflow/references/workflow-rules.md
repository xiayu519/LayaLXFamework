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
- 模型默认值仅在 `.codex/config.toml` 维护；用户当前显式选择优先，Skill 不重置模型。子代理默认继承主线程，仅在用户授权降成本时改用较低档执行模型，验收标准不降低。
- 语义评测包含无需 Skill 的负例、邻域误触发和工作流决策；拒绝工具调用防止读取预期答案，分类评测不能冒充端到端代理执行证明。token 是执行后失败阈值，不是硬花费上限。只有语义输入变化才由开发者已登录的本地 Codex CLI 执行一次；普通 YAML、脚本、测试实现和文档改动只跑本地确定性门禁。GitHub Actions 只校验框架同步契约，不调用模型或要求 API key。
- 静态检查最多 3 路并行；日常门禁不得调用 Laya CLI 或模型，一次完整发布验证足够，不重复无相关变化的通过项。
- 本机工具只检测环境，不执行系统软件安装；缺少依赖时指向 `Books/LXFamework-Environment.md`。默认使用 Node 跨平台 API 和 `node:path`，系统路径与可执行文件按平台发现。

## Collaboration

- 框架由一人维护，投入使用后约 2–3 人可能并行工作；使用团队规模不等于 Codex 代理数量。
- Codex 默认单代理执行；仅任务确实跨独立风险边界或用户明确要求时委派。子代理默认继承主线程，验收不降级。
- 写前重读目标，保留其他成员改动；检测到同一区域并发变化就停止报告。
- 公共候选先证明跨业务复用、稳定语义、Laya 无等价能力、失败边界与验证；否则留在 game。
- `src/game/logic/` 只放可被游戏调用的业务逻辑脚本，不是游戏或 Codex 游戏层。仅当用户明确开始业务并给出名称时，Codex 将名称整理为英文 kebab-case，再用 `game:create -- --name <原名> --id <english-id>` 创建 `src/game/<english-id>/AGENTS.md`、`.agents/skills/` 和游戏记忆；从该游戏目录启动时才叠加游戏层。
- 游戏层不复制公共规则且 Skill 不与公共层重名；生成与发现规则由 `npm run validate:game-workflow` 检查。
- Windows/macOS 兼容结论必须来自相关平台上的本地原地构建与同一 Headless 验收；GitHub 同步契约不能替代运行时验证。
- Git 操作仅在开发者明确要求时执行。

## References

- Codex configuration precedence: https://learn.chatgpt.com/docs/config-file/config-basic
- Codex AGENTS.md: https://developers.openai.com/codex/guides/agents-md#layer-project-instructions
- Tyou workflow: `D:\gitframework\Tyou\Books\AI-Development-Workflow.md`
- Domain references: `D:\layapro\esengine`, `D:\layapro\GameFrameX.LayaBox`
