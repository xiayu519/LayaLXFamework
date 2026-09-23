# Sol 工作流适配与验证记录

> 这是 2026-09-20 的 GPT-5.6 Sol 历史验收记录，不代表当前推荐评测基线。现行结果见 [GPT-6 Sol 工作流兼容验收](gpt6-sol-workflow-validation.md)。

## 结论

截至 2026-09-20，当前 Codex 工作流已适配 `gpt-5.6-sol` 的 `medium`、`high`、`xhigh` 三档推理强度，并在完整语义分类集和三档独立开发任务中通过验证。

项目不替开发者指定模型或推理强度：`.codex/config.toml` 不包含 `model` 与 `model_reasoning_effort`。开发者可按任务自行选择；当前工作流只对以下 Sol 组合给出兼容性声明：

| 任务级别 | 建议组合 |
| --- | --- |
| 普通执行 | `gpt-5.6-sol` + `medium` |
| 复杂任务 | `gpt-5.6-sol` + `high` |
| 最复杂任务 | `gpt-5.6-sol` + `xhigh` |

其他模型或强度仍可由开发者选用，但不属于本次验证范围。

## 配置边界

- 开发者选择：实际使用的 `model` 和 `model_reasoning_effort`。
- 项目默认：仅保留 `model_verbosity = "low"`，减少非必要输出。
- 兼容性基线：`.agents/skills/codex-workflow/evals/policy.json` 独立声明 `gpt-5.6-sol` 与 `medium/high/xhigh`，只用于工作流评测和兼容性说明。
- 评测覆盖：环境变量仍可显式覆盖模型和强度，用于对比测试；未显式覆盖时使用兼容性基线，而不读取开发者的 `.codex/config.toml`。

模型标识与推理强度依据 OpenAI 官方资料：[Codex 模型](https://learn.chatgpt.com/docs/models)、[`gpt-5.6-sol`](https://developers.openai.com/api/docs/models/gpt-5.6-sol)、[Codex 配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)。

## 适配改动

- 将工作流兼容性策略从开发者配置中分离，避免评测结果随个人选择漂移。
- 将正式兼容强度限定为 `medium`、`high`、`xhigh`，并设置分档输出预算：`3200`、`4000`、`5200` tokens。
- 明确路由动作中 `implement` 与 `stay_in_scope` 的语义，减少同范围实现任务被误判为只读处理。
- 收紧 `laya-runtime-lifecycle` 与 `laya-ui2` 的边界：窗口实例/会话绑定归 `laya-ui2`，窗口内部通用 Event、timer、Tween 清理归 `laya-runtime-lifecycle`。
- 按当前评测分组动态生成结构化输出 schema，限制 ID 只能出现在所属分组，避免高强度推理时跨组重复返回。
- 将验收时机固定为完成授权范围内全部改动之后的一次集中验收；中间状态不逐文件或逐子步骤预跑，失败后只重测受影响项。

## 完整语义评测

环境：Windows，Node.js `24.14.0`，Codex CLI `0.153.2`。当前集合包含 48 条 Skill 路由、21 条决策和 12 条验证选择，共 81 条。

完成全部改动后，三档各执行一次完整临时只读评测。三档都精确通过 80 项，并在同一个新增案例中遗漏 `diff_links`：原请求只泛称“文档”，不足以明确触发链接检查。保持 expected 不变，将请求明确为“README 新增相关文档链接”后，只重测两个新增的验收时机正反例；三档均 2/2 通过。其余输入未变，因此当前 81 项均有通过证据，没有为制造通过删除案例或放宽预期。

| 模型与强度 | 完整运行 | 输入 tokens | 输出 tokens | reasoning tokens | 耗时 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `gpt-5.6-sol` / `medium` | 80/81 | 22,564 | 1,920 | 831 | 64.049 s |
| `gpt-5.6-sol` / `high` | 80/81 | 22,564 | 1,961 | 872 | 60.199 s |
| `gpt-5.6-sol` / `xhigh` | 80/81 | 22,564 | 2,476 | 1,387 | 71.075 s |

| 模型与强度 | 受影响案例复验 | 输入 tokens | 输出 tokens | reasoning tokens | 耗时 | 当前覆盖 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `gpt-5.6-sol` / `medium` | 2/2 | 16,583 | 104 | 50 | 21.417 s | 81/81 |
| `gpt-5.6-sol` / `high` | 2/2 | 16,583 | 105 | 51 | 21.915 s | 81/81 |
| `gpt-5.6-sol` / `xhigh` | 2/2 | 16,583 | 103 | 49 | 20.133 s | 81/81 |

完整运行使用相同输入，`medium` 的输出与 reasoning tokens 最少；这支持把它作为普通分类任务的高性价比建议。单次耗时和小子集输出并不严格随强度递增，因此不能把本样例外推为所有开发任务的固定成本比例。

改动前基线使用 `gpt-5.6-sol` / `medium`：输入 21,909、输出 2,606、reasoning 1,538、耗时 68.549 s。它超过旧的 2,500 输出预算，在进入结果比较前失败，因此不作为语义正确率证据；该失败促成了分档预算和结构化输出约束的调整。

## 独立开发任务前向验证

三个代理分别以对应 Sol 强度执行相互隔离的小型开发任务，根代理复查实现并统一验收：

| 强度 | 任务 | 代理自验 | 根代理复验 |
| --- | --- | --- | --- |
| `medium` | 数字标签千分位格式化，保持公开 API | Node tests 3/3；项目 typecheck | 纳入联合测试 |
| `high` | 可暂停、恢复、重启的确定性比赛时钟 | Node tests 5/5；本地 strict tsc | 纳入联合测试 |
| `xhigh` | 最新请求胜出的异步值提交与精确释放 | Node tests 4/4；本地 strict tsc | 纳入联合测试 |

根代理联合运行三组测试：12/12 通过；三个 TypeScript 文件的联合 strict tsc 通过。测试夹具位于忽略的 `temp/codex-forward/sol/`，不会进入版本控制。

前向验证证明三档能够在当前指令和 Skill 约束下完成对应复杂度样例。代理协作接口未提供完整的任务执行 token 与总耗时，因此不据此声称三档在所有开发任务上的绝对成本比例。

## 确定性验证

- `npm run test:workflow`：11 个测试文件、94 个测试全部通过。
- `npm run check:skills`：27 个公共 Skill、0 个游戏 Skill；`AGENTS.md` 为 3068/3072 bytes，Skill description 为 2230/2500 bytes。
- `npm run check:memory`：21 条索引、1 个 scope，通过。
- `npm run typecheck`：`tsconfig.json` 与 `tsconfig.test.json` 均通过。
- `laya-runtime-lifecycle`、`laya-ui2` 的 Skill quick validation 均通过。

本次改动只涉及 Codex 工作流、Skill 边界、测试和文档，没有修改 Laya 运行时行为，因此未运行 Laya Headless 或发布验证。实测环境仅为 Windows；没有据此推断 macOS 执行结果。模型可用性仍取决于开发者账号与所用 Codex 客户端。
