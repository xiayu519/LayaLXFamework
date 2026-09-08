# LXFamework GPT-6 开发工作流

本工作流面向 GPT-6 的各标准推理档位，共用同一套 Skill、授权边界和验收标准。`medium` 只是当前可覆盖的默认选择，不是工作流要求或支持下限；项目模型与强度默认值只在 [config.toml](../LayaProject/.codex/config.toml) 维护。用户当前显式选择优先，工作流不自动升降档。项目不额外设置 Plan 专用强度覆盖；客户端 Plan 有自己的预设，切换模式后以实际选择器为准，不能仅凭项目配置声称继承当前档位。修改配置不能切换正在运行的模型。

## 仓库与工作目录

Git 仓库根目录是 `LayaLXFamework`，LayaAir 项目与完整 Codex 工作流位于 `LayaProject`。本机依赖由开发人员按 [开发环境说明](LXFamework-Environment.md) 准备，仓库与 Codex 不自动安装系统软件。环境就绪后从项目目录启动 Codex：

```shell
cd LayaProject
npm ci
npm run doctor
```

框架任务从 `LayaProject` 启动。`src/game/logic/` 只是不可删除的可调用逻辑脚本库，不是具体游戏，也不从该目录启动游戏 Codex 层。用户明确开始业务并提供名称时，Codex 先将名称整理成英文 kebab-case，再执行：

```shell
npm run game:create -- --name "用户提供的名称" --id english-game-name
codex --cd src/game/english-game-name
```

没有明确的业务名称时不预建游戏目录。命名游戏可以调用 `src/game/logic/`，logic 不得反向依赖具体游戏，两个具体游戏也不得互相依赖。

Codex 对两类文件采用不同的官方发现顺序：`AGENTS.md` 从 Git 根目录向当前目录合并，所以 `LayaProject/AGENTS.md` 先于游戏文件生效，冲突时更近的规则优先；Skills 从当前目录向仓库根扫描，所以公共与游戏 Skills 同时可用。从 `LayaProject` 根启动不会加载游戏层。游戏规则不得复制公共规则，游戏 Skill 使用独立名称。

## 提出与完成任务

说明想得到的游戏行为、目标平台、验收与硬约束；已在会话或配置中确定的信息无需重复。Codex 先查现有实现和相邻测试，按 description 选择最窄 Skill。根规则维护通用边界，Skill 只补领域知识，reference 按需读取；不要求每个任务加载全部工作流或记忆。

例如：“给星港游戏的背包弹窗补关闭后异步图标失效，保持现有 UI 路由；快速开关不再回写已销毁节点，并验证。”Codex 应定位当前游戏和窗口生命周期、实施、跑相关测试；涉及真实 ui2 行为时再做 Headless 验收。

实施请求授权范围内的可逆工作与必要验证。只有无法查明、会实质改变结果的产品选择需要追问；普通命名纠正、实现细节和文件数量变化直接处理。用户询问进度或中途补充时保留原任务目标。只读分析请求仍只读。

输出先说明结果、相关文件和验证证据；不要用长计划、固定格式或重复检查占据简单任务。无法完成时报告具体失败、尝试和未验证项，不自行切模型或扩大范围。

## 模型与成本

支持 `low`（Light）、`medium`、`high`、`xhigh`、`max`，可按个人偏好与任务选择，无需切换或重写工作流。较低档位可优先考虑速度，较高档位可用于深入分析；这不是任务与档位的强制映射，也不承诺相同的一次成功率。Ultra 包含自动委派，不属于本项目单代理评测范围。

先减少无关读取、重复指令和重复验证，再考虑档位成本。文本长度只是冗余检查，不等于 token；阈值集中在 [policy.json](../LayaProject/.agents/skills/codex-workflow/evals/policy.json)，公共与游戏 Skill description 分开计量。只有真实比较任务质量、总 token 与耗时后才声称性价比改善。

## 公共变更与协作

框架代码位于 `src/framework/`，命名游戏业务位于 `src/game/<id>/`。业务发现公共候选时，先证明稳定复用、真实消费者和失败边界；不能证明则留在当前游戏。

新共享语义或高回滚成本变更按 [Change Contract](../LayaProject/.agents/skills/sdd-explore/references/alignment-contract.md) 对齐。用户明确指定共享变更与结果，或批准已列明方案后，继续完成实施与验证；保契约内部修复不因在 framework 目录重复审批。新增内容超出授权时只暂停该边界，独立工作继续。因 Skill 停顿时提供具体文件、条款和尚缺的决定。

框架由一人维护，使用团队约 2–3 人。Codex 默认单代理；独立风险边界的委派需有收益与隔离的文件区域，子代理继承当前模型/强度。多人写入前复读目标，无法避开的同区域冲突停止报告。Git 写操作按用户授权执行。

下游仓库存在 `.framework-lock.json` 时，manifest 管理内容为只读；框架缺口反馈上游，稳定消费等待验证后的 Tag，开发联调可按需同步已提交的 channel snapshot。目录所有权、启动扩展点和同步命令只在 [框架发行与下游同步](../LayaProject/docs/framework-distribution.md) 维护。

## 验证

按改动选择覆盖风险的最小命令；已有通过证据只在相关变化、新失败或疑点出现时重跑。新增测试证明行为与失败边界，不复刻实现。

| 改动 | 验证入口 |
| --- | --- |
| TS 行为 | `npm run typecheck` 与 `npm test -- <相关测试文件>` |
| 依赖方向/模块边界 | 加 `npm run check:architecture` |
| 源资产、Tables、导入、资源 | 对应 Skill 的领域检查 |
| 完整快速回归 | `npm run verify`，无 Laya CLI、.NET、Python 或浏览器 |
| 真实引擎行为 | 按需 `npm run test:headless` |
| 工作流规则/工具 | `check:skills`、`check:memory`、`validate:game-workflow`、`test:workflow` |
| 快速门禁链路本身 | `npm run test:verification`，独立于普通测试 |

只有改动影响 Laya 发布链或准备正式发布时才执行 `npm run verify:release`。它先检查环境，以最多 3 路并发运行完整静态检查，全部通过后只构建一次，并由 Headless Chromium + SwiftShader 检查真实 LayaAir 3.4.1 2D 发布包。已通过且没有相关文件变化的检查不重复执行。

Windows 与 macOS 共用同一套 AGENTS、Skills 和 npm 命令。GitHub Actions 只运行 framework manifest、lock、upstream 与同步工具的纯 Node 契约检查，不安装或检测 LayaAir、.NET、Python、浏览器和 Codex CLI。快速门禁、领域检查及 `npm run verify:release` 全部由开发者在相关本机按需执行；缺少环境时按 [开发环境说明](LXFamework-Environment.md) 准备。

模型调用只用于模型/CLI 迁移、AGENTS、Skill 决策/description 或路由变化的验收，详见 [工作流评测](../LayaProject/.agents/skills/codex-workflow/references/evaluation.md)。分类测试与实际执行分别报告；日常开发不反复跑模型评测。普通排版、展示 YAML 或无语义脚本变化只跑确定性检查。

本次迁移的分类、真实 Laya 执行证据和成本计量限制统一记录在 [GPT-6 工作流迁移验收](../LayaProject/docs/gpt6-workflow-validation.md)，不在使用手册中重复维护成绩。

真实商店、小游戏容器或 Native 签名等无法由 Headless 证明的行为应列为未验证项，不自动切换到 GUI。

## 项目记忆

公共框架经验存放在根 `.codex/memory/`，单个游戏经验存放在 `src/game/<id>/.codex/memory/`；游戏目录查询时叠加两者。`project-memory.mjs search` 默认只返回 active；查历史加 `--include-history`，输出状态，废弃决定不再作为当前指令。只记录经验证的长期内容，历史正文保留替代关系。

## 依据

- [OpenAI：GPT-6 提示与迁移](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra#prompting-best-practices)
- [OpenAI：GPT-6 模型能力](https://developers.openai.com/api/docs/models/gpt-6-astra)
- [OpenAI：Codex 模型与强度](https://learn.chatgpt.com/docs/models)
- [OpenAI：Codex AGENTS.md 分层项目指令](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [OpenAI：Codex 项目配置层级](https://learn.chatgpt.com/docs/config-file/config-basic)
- [OpenAI：Codex Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)

人工使用方式和公共 API 见 [项目 README](../README.md)；内部所有权和生命周期边界见 [运行时架构](../LayaProject/docs/architecture.md)。
