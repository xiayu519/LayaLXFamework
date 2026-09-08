# Workflow evaluation

## Deterministic checks

按 [workflow-rules.md](workflow-rules.md#verification) 选择检查；`npm test -- tests/workflow/<相关文件>.test.ts` 可单独覆盖检索、评测隔离、生成或配置行为，无需附带整组 `test:workflow`。

仅验证器/快速门禁链路变化时加 `npm run test:verification`，它独立运行完整 fast profile 的集成测试，避免普通单测嵌套启动 verify。

## Routing classifier

`npm run test:skill-routing` 无参数运行全套；局部语义变化用 `-- --case <id>`（可重复），或 `-- --group routing|decisions|verification` 选择一组。选择器取并集；未知或重复选择器报错，不静默退回全量。路由仍提供完整 Skill description，避免筛掉竞争 Skill 制造通过；无路由案例时不加载该目录。

验证选择只注入现行规则中相关的验证章节，不附带模型介绍、官方链接或环境安装说明；章节缺失直接报错。

默认模型与 effort 从项目配置读取；专项比较用 `LX_CODEX_EVAL_MODEL` / `LX_CODEX_EVAL_EFFORT` 显式覆盖，不修改日常配置。每次单轮、原地、ephemeral、read-only，由本地已登录 Codex CLI 执行；不要求 API key。

CLI 版本和后置 token/超时阈值位于 [policy.json](../evals/policy.json)。仅在兼容性失败或明确升级客户端时改变版本。拒绝工具调用，expected 不放进提示；输出须精确覆盖选中的 [cases.json](../evals/cases.json) 与 [verification-cases.json](../evals/verification-cases.json)，缺失、多余或重复结果均失败。先记录 usage 再检查预算；预算是运行后失败阈值，不是服务端花费上限。子集通过不得宣称全套通过。

模型迁移先保留旧规则建立目标模型基线，再测新规则的日常档位。支持范围的首次迁移检查 `low/medium/high/xhigh/max` 各一次；后续只复验受影响档位。不同案例数量的 token 不作直接效率比较，记录完成质量、耗时与 token，不能仅凭便宜宣布更优。

## Execution evidence

分类不能证明实际读 Skill、改文件、选测试或保留任务目标。执行语义变化需要独立 forward-test：向代理只提供真实请求、当前规则和必要原始材料，不透露预期答案或本次改动结论。

允许临时目录中的最小生成测试材料，不复制 Laya 项目、不生成正式游戏。限定可写目录与操作；检查实际产物、命令、暂停原因与未验证项。纯评审案例只读。当前仓库中的规则只读，不允许被评测代理修改。

覆盖本次风险：已授权局部实现、普通纠正、只读诊断、共享边界、命名游戏路径、最小验证、历史记忆与显式模型选择。日常以项目配置 effort 为主；失败保留证据，定位后只重测受影响案例。使用客户端而非文本声称实际模型/强度；不能用另一档位的成功代替失败档位。

验证 Light 下限需有 `low` 的真实实现样例；复杂任务选择相应高档独立执行，不要求低档与高档有相同成功率。涉及 Laya 的产物必须进入真实引擎探针。当前发布输入未变且已有本轮构建证据时，可通过 `node tools/test-browser.mjs --suite targeted --probe <module.mjs>` 加载临时产物，不逐例重建或附带无关探针。模块约定见 [Headless verification](../../laya-headless/references/verification.md)。

工具权限失败与业务失败分别记录；进程 exit 0 或代理说完成都不是验收证据。不能为跑通评测放宽权限。只有拿到完整 usage 才报告总 token；缺失时明确不可计量，禁止用分类 token 代替执行成本。

报告分类、执行样例、确定性检查三类证据。跨平台与真实游戏发布须有对应环境结果，本评测不冒充 Laya 或商店验收。
