# Workflow Rules

## Instruction design

- `AGENTS.md` 维护跨任务约束；Skill 只补领域决策、失败边界和专项验收。不要把同一句规则复制到各 Skill，也不要复制官方通用提示全文。
- description 描述独立能力；排除最易混淆的邻域。不用关键词路由、固定步骤数量或模型档位决定是否需要 Skill。
- 规则解决已证明的问题；删除陈旧路径与模糊的暂停条件。普通纠正是任务输入，只有超出授权语义才重新对齐。查阅与核验能解决的不确定性由代理消除。
- 先用当前代码、测试与固定版本源码核验事实。官方文档用于核对模型/客户端能力；外部案例仅供参考，不覆盖本地已验证的 Laya 行为。

## Cost and model compatibility

- `.codex/config.toml` 是模型与强度默认值的唯一入口；修改配置不等于切换已运行的会话。低强度仍遵守相同边界与验收，不自动升降档。
- Light 对应 `low`。标准 effort 为 `low/medium/high/xhigh/max`；Ultra 包含自动委派，不作为单代理评测 effort。客户端支持以实际运行核验。
- 文本预算在 [policy.json](../evals/policy.json) 单点维护，按 bytes/字符检查冗余，不能冒充 token 计量或逼迫省略关键条件。公共与游戏 description 分开预算；按需读取内容。
- 优先并行独立读取与检查；依赖步骤顺序执行。委派需有独立输入、输出和可核查结果，收益应覆盖交接成本；不按文件数或团队人数凑代理。

## Verification

- 按实际消费者选检查，不因属于工作流就全跑：普通说明/导航只查差异和相关链接；AGENTS/Skill/路由数据改动用 `check:skills`；记忆记录/索引用 `check:memory`；游戏模板/发现规则用 `validate:game-workflow`。工具行为变化只跑对应 `tests/workflow/*.test.ts`；多边界重构才用整组 `test:workflow`。未改动的记忆和模板不陪跑。
- AGENTS、Skill 决策/description、路由案例、模型或 CLI 变化时读取 [evaluation.md](evaluation.md)，运行相关模型验收；普通排版、YAML 展示信息和无语义脚本改动只跑确定性检查。
- 日常不调用模型；语义变化按 [evaluation.md](evaluation.md) 筛受影响案例和邻接反例，核心迁移才扩大覆盖。通过后不重复无相关变化的检查；验证范围扩大时说明新增风险，不以“保险”作为全量理由。
- 已批准任务的验收发现规则问题时直接修正并复验受影响项，不放宽 expected 或删掉失败案例来制造通过。

## Game layer

从命名游戏目录启动时叠加公共与游戏 Skills/AGENTS；根目录启动不隐式加载子游戏规则。游戏 Skill 使用独立名称，只维护当前游戏约束；生成与发现由 `validate:game-workflow` 检查。`src/game/logic/` 不创建游戏 Codex 层。

## Official references

- [GPT-6 prompting and migration](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra#prompting-best-practices)
- [GPT-6 capabilities](https://developers.openai.com/api/docs/models/gpt-6-astra)
- [Codex models and reasoning](https://learn.chatgpt.com/docs/models)
- [Configuration precedence](https://learn.chatgpt.com/docs/config-file/config-basic)
- [AGENTS discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
