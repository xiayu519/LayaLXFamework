# GPT-6 Sol 工作流适配与验证记录

日期：2026-09-23。范围：Codex 指令、独立评测基线、项目记忆、测试与开发文档；未修改游戏或 Laya 运行时。

## 模型边界

项目不设置 `model`、`model_reasoning_effort` 或 `plan_mode_reasoning_effort`。用户当前选择优先；`gpt-6-sol/high` 是执行建议，`gpt-6-sol/xhigh` 是大型、复杂任务分析建议，均不由 Skill 或任务过程自动切换。正式兼容评测只覆盖这两档；其他选择仍按用户要求完成任务，不借本报告声称已验证。

评测通过 [policy.json](../.agents/skills/codex-workflow/evals/policy.json) 独立指定模型、强度与 CLI 版本，使用 `--ignore-user-config` 隔离开发者日常配置。OpenAI [GPT-6 Sol 模型页](https://developers.openai.com/api/docs/models/gpt-6-sol)确认支持 `high/xhigh`；[Codex 更新记录](https://learn.chatgpt.com/docs/changelog)记录 CLI 0.156.1 加入 GPT-6 Sol 模型目录。官方 [推理指南](https://developers.openai.com/api/docs/guides/reasoning)建议用实际评测判断 `xhigh` 的额外消耗是否值得。

## 项目记忆

仓库记忆按需检索，不自动注入；公共记忆与当前命名游戏作用域叠加，采用前核对日期和现行规则。Codex 官方用户端 [Memories](https://learn.chatgpt.com/docs/customization/memories) 与仓库 `.codex/memory/` 分离，本轮不改变其开关或生成状态。

本次核对并修正两条有效记忆的漂移：路由评测经验改为指向现行 CLI 策略；框架发行决定改为允许已选定的当前项目修改 managed files，保留同步覆盖前确认。

## 验收结果

### 确定性检查

- `git diff --check` 通过；`npm run check:skills` 通过，27 个公共 Skill、0 个游戏 Skill，根 `AGENTS.md` 为 3067/3072 bytes，公共 description 为 2230/2500 字符。
- `npm run check:memory` 通过，1 个 scope、21 条索引；相关的 3 个 workflow 测试文件共 42 项通过；`npm run typecheck` 的项目与测试配置均通过。
- 检查 `.codex/config.toml`：无 `model`、`model_reasoning_effort`、`plan_mode_reasoning_effort`。评测策略文件只作用于评测子进程，不改变开发者会话。

### 完整语义评测

环境：Windows、Node.js 24.14.0、本地已登录 Codex CLI 0.156.1。每档各运行一次完整只读、单轮评测；48 条 Skill 路由、22 条授权/模型决策、12 条验证选择全部精确通过。两次运行的 cached input 与 cache write 均为 0。

| 评测档位 | 结果 | 输入 tokens | 输出 tokens（含 reasoning） | reasoning tokens | 耗时 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `gpt-6-sol/high` | 82/82 | 24,018 | 2,229 | 952 | 54.728 s |
| `gpt-6-sol/xhigh` | 82/82 | 24,018 | 2,430 | 1,153 | 52.104 s |

`xhigh` 在这次分类样本中多消耗 201 个输出 tokens；单次耗时受运行条件影响，不据此认定它一定更快或更慢。分类通过证明所选规则和案例的判断一致，不能证明完整开发任务的质量、总成本或一次成功率。没有在旧规则上单独运行 GPT-6 Sol 基线，因此本轮也不声称相对旧规则的精度或成本提升幅度。

### 独立执行样例

- `gpt-6-sol/high` 代理只获得局部实现请求与预置测试，限写 Git 忽略的 `temp/codex-forward/gpt6-sol/high/score.mjs`；实际实现了安全整数千分位、负零和非法输入处理。`node --test temp/codex-forward/gpt6-sol/high/score.test.mjs` 的 3 项测试通过；主线程复查了实际产物。
- `gpt-6-sol/xhigh` 代理只读审查了用户模型选择、项目记忆检索和带 lock 的下游 managed files 边界。它实际运行记忆搜索，核对了现行 Skill、脚本与两条修正后的 active 记忆，确认记忆不能覆盖用户模型选择，已选当前项目可修改 managed files，同步覆盖差异仍需另行选择。当前仓库无 `.framework-lock.json`，下游结论基于发行规则和工具实现。

曾尝试用固定版本 Codex CLI 做 `high` 文件操作样例；该嵌套会话的工具权限拒绝了只读命令和测试命令，虽以 exit 0 结束，却没有产物，**不计入通过结果**。其 usage 为输入 66,540（其中 cached 59,648）、输出 1,308（其中 reasoning 595）tokens；没有为取得通过而放宽权限。随后使用独立代理接口完成上述样例。代理接口不提供完整任务 usage，因此不能将分类用量或失败 CLI 用量冒充实际开发总成本。

### 验证边界

本轮未改变游戏、Laya 运行时、生成模板或发布输入，未运行 Headless 与 `verify:release`。Windows 上的验证不能推断 macOS、小游戏、Native 或商店发布结果；本轮未验证完整游戏开发、长会话恢复、所有记忆命中质量或不同客户端账号的模型可用性。官方用户端 Memories 的开关状态也未由仓库检查确认。

旧 [GPT-5.6 Sol 验收](sol-workflow-validation.md)、[GPT-6 Astra 验收](gpt6-workflow-validation.md)和[项目记忆精简验收](project-memory-validation.md)保留其当时的模型、日期和结果。
