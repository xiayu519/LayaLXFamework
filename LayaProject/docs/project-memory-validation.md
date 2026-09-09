# 项目记忆精简与验收

日期：2026-09-09。范围：仓库记忆、Skill、检索/校验工具、定向测试与工作流文档；未改游戏、引擎、项目模型配置或用户级 Codex 状态。

## 官方依据与本机观察

- [GPT-6 prompting best practices](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra#prompting-best-practices) 强调检查 Skill/AGENTS 中可能导致停顿、过量测试的冲突指令。它支持清理项目提示，不能证明任何本地记忆都会降低模型能力。
- [GPT-6 模型页](https://developers.openai.com/api/docs/models/gpt-6-astra) 描述模型上下文与工具能力；不能据此认定升级模型会自动接管仓库记忆。
- [Codex Memories](https://learn.chatgpt.com/docs/customization/memories) 将记忆定位为辅助回忆，团队必守规则仍放在 AGENTS 或版本化文档。官方本地记忆在启用后从符合条件的既往会话后台生成，默认目录为 `~/.codex/memories/`；这是客户端功能，与仓库 `.codex/memory/` 不同。
- 本机默认 Codex home 的 memories 目录为空，用户/项目配置均未显式设置 memories。未观察桌面客户端实际开关或后台任务，因此不声明所有客户端都关闭了官方记忆。未手改全局配置、官方生成文件或同步两套存储。

## 发现与处理

- 原工作集 48 条中有 21 条 superseded，保留旧固定模型、logic 默认游戏、Spine 4.2、自建资源层和全量门禁等完整指令。原默认检索已过滤它们，但 INDEX、全文搜索与显式历史入口仍可读到。按用户授权直接删除，不迁移或维护替代链。
- 另删除 4 条已被现行规则完整表达的重复记录：framework/game 所有权、仓库绝对路径、Skill 语义路由、源码优先设计。保留有独立复现原因的领域经验，以及有价值的用户纠正背景。
- 修正 active 记录中的旧 GitHub 双平台 release CI、同步后完整回归要求、旧测试路径及旧 `LX.Config` 二进制入口说明。模型、维护人数和验证反馈改为链接当前规则，避免维护第二份指令。
- 项目记忆只作线索，采用前核对范围、日期与当前证据；不新增审批、切模型或扩大验收。无检索命中时回到代码/文档，不全库补读。冲突/过时记录直接清理，历史按需查 Git。
- 移除 `--include-history`；校验器只接受 active，并检查正文的本地链接。检索排除公共 `.codex/memory` 路径和 frontmatter 管理字段造成的无关命中，保留文件名、正文、中文关键词与完整模型/版本标识匹配；输出核验日期和来源。

记忆工作集含 INDEX 的 UTF-8 大小从 69,734 bytes 降至 32,485 bytes，条目从 48 降至 23。字节减少不等于模型 token 或总开发成本同比下降。

## 确定性验证

- `npm test -- tests/workflow/ProjectMemorySearch.test.ts`：8 项通过。覆盖旧历史参数拒绝、非 active 隔离、正文命中、管理字段去噪、标识匹配、公共/当前游戏/其他游戏/logic 作用域，以及公共和游戏中的失效证据链接拒绝。
- `npm run typecheck`：项目与测试配置通过。
- `npm run check:skills`：27 个公共 Skill 通过；description 总量未变。`npm run check:memory`：23 条、1 个作用域通过。
- 改动文档本地链接与 `git diff --check` 通过。现有游戏模板继续生成空记忆索引，没有新增 schema 或模板逻辑。

## 模型分类与独立执行

固定 Codex CLI 0.153.2、`gpt-6-astra/medium`，ephemeral、read-only、无工具分类：4 个相关路由、2 个模型/委派决策、2 个验证范围案例全部通过。input 20,135 / output 132 tokens，cached input 与 cache write 均为 0，13.9 s。首次误写 `verify_docs` 被选择器在模型调用前拒绝；更正为已有 `verify_docs_only` 后执行，没有放宽 expected 或预算。

分类只验证邻接路由和现行规则选择，不证明实际读取了记忆 Skill。另由独立代理在当前工作区执行只读请求，不提供改动结论或 expected，禁止读取 diff 与本报告：

1. 查找 Headless、模型档位和维护人数纠正，并判断 README 单个 npm 命令说明改动的影响。代理实际检索三条反馈并核对当前 AGENTS/配置，选择差异、命令和链接核查；尊重请求中的显式 low，未改文件、运行测试或扩大委派。这是选择行为，不能据此声称代理运行档位为 low。
2. 首次执行因 Skill 的相对路径含糊，两次把脚本定位到工作目录 `scripts/` 后失败。修正为相对 Skill 目录的明确 Node 入口，复验实际查询 `Loader.BUFFER` 与不存在的标记：全部命令成功。代理只读取匹配记忆及当前 `GameTablesService.ts` 核验 `.data` 解包与现行目录；空查询结果没有引发全库补读，并明确未重新运行引擎。

独立代理接口没有完整 usage；分类用量不能代替主线程与独立执行总成本。

## 限制

未启用官方 Memories 做双系统端到端运行，也未实测 macOS、全模型档位矩阵、完整游戏任务或长期记忆积累效果。没有证明精简后模型成功率或总成本的量化提升；本次证据证明已清除已知冲突、检索噪声与相对路径问题。未触发引擎或发布链变更，因此没有运行 Headless、verify 或 verify:release。

现行使用规则见 [memory-policy.md](../.agents/skills/project-memory/references/memory-policy.md) 与 [开发工作流](../../Books/LXFamework-Codex-Workflow.md#项目记忆)。
