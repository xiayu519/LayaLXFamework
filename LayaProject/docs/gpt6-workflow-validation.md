# GPT-6 工作流迁移验收

日期：2026-09-08。环境：Windows、Node v24.14.0、本地已登录 Codex CLI 0.153.2。范围：Codex 配置、规则、Skill、记忆检索、验证工具及上游同步契约；未修改游戏/引擎实现。

## 配置与依据

当前配置为 `gpt-6-astra`，执行默认 `medium`，verbosity 为 `low`；以 [当前配置](../.codex/config.toml) 为准。后续兼容性复核移除了初次迁移写入的 `plan_mode_reasoning_effort = "medium"`，不再由项目额外固定 Plan 档位。[官方配置参考](https://learn.chatgpt.com/docs/config-file/config-reference) 明确 Plan 未设置时使用客户端内建预设，并非保证继承执行档位；模式切换以客户端实际选择为准。

定位澄清：兼容目标是 GPT-6 各标准档位，Medium 仅是本次默认与实际执行样例所用档位，不是工作流要求或支持下限。以下保留迁移当时的实测数据。

依据 [GPT-6 提示与迁移建议](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra#prompting-best-practices)、[模型能力](https://developers.openai.com/api/docs/models/gpt-6-astra) 和 [Codex 模型说明](https://learn.chatgpt.com/docs/models)，落实自主完成、Skill 冲突透明化与按风险验证。Light 使用 `low`；Ultra 不列入单代理 effort 验收。

## 分类实测

先在旧规则上用目标模型 high 建立基线：38 路由 + 10 决策通过，input 20,451 / output 830。新规则增加批准后继续、普通纠正、上下文推断、用户进度询问、明确 Medium、独立工作与产品选择等案例。

Medium 首次失败：`approved_ui_fix` 多选了 `laya-headless`，input 20,810 / output 759。修正 Headless description，明确领域任务仅调用现成验收命令不触发该 Skill；保留原 expected，复测通过。

最终同一套 40 路由 + 17 决策：

| effort | 结果 | input | output（含 reasoning） | reasoning | 耗时 |
| --- | --- | ---: | ---: | ---: | ---: |
| low | 57/57 | 20,808 | 754 | 0 | 33.9 s |
| medium | 57/57 | 20,808 | 754 | 0 | 31.1 s |
| high | 57/57 | 20,808 | 950 | 74 | 36.3 s |
| xhigh | 57/57 | 20,808 | 1,707 | 831 | 60.3 s |
| max | 57/57 | 20,808 | 2,257 | 1,381 | 76.9 s |

均为原地、ephemeral、read-only 单轮，无工具执行，cached input 与 cache write 均为 0。每次均在原有 25,000 input / 2,500 output 后置阈值内；未通过扩大预算或放宽 expected 消除失败。保留已实测兼容的 CLI 固定版本。

本次七次 CLI 调用（含基线及失败）合计 input 145,301 / output 8,011；不包含主线程和独立代理用量。每档仅一次最终样本，耗时受服务端与并发影响；分类 token 不能推出真实游戏任务的平均成本、成功率或 Medium 与高档能力相等。

## 实际执行样例

独立 `gpt-6-astra/medium` 代理只获得请求、当前规则和原始材料，未提供预期答案或迁移结论；写入限定 `temp/codex-forward/`，未复制 Laya 项目、创建正式游戏或修改框架。

- 分数显示：使用 bounded-task，保持 `formatScore` 接口，实现英文逗号分组并纳入负数补充要求。实际产物通过 3 项 Node 测试与局部 TypeScript 检查，无额外确认。
- 冷却逻辑：使用 gameplay-domain，实现显式时间、暂停恢复、进行中拒绝重启、归零及无效输入保持状态。通过 5 项 Node 测试与 strict TypeScript 检查，不依赖引擎或系统时间。

主线程核阅实际文件与测试；另由独立代理只读审查本轮工作流 diff、调用关系与同步契约，未发现需修正的问题。这些是小型实际任务证据，不覆盖完整游戏制作、长会话恢复或全部领域。

### Light 与 xhigh 的真实 Laya 执行补验

按用户确认的兼容下限补测两个独立任务，代理由客户端显式指定 `gpt-6-astra/low`、`gpt-6-astra/xhigh`，没有继承主线程的答案或改动结论。请求与原始故障文件在 `temp/codex-forward/v2/`；只允许修改各自任务目录，仓库规则与工具只读。未创建正式游戏或复制项目。

| effort | 实际任务 | 产物与验收 |
| --- | --- | --- |
| low（Light） | 修复 `bindTapCounter` 的 UI 点击计数与清理 | 真实 `.lh` 的 `GWidget/GTextField`；计数 `0→1→2`，清理后不变，重新绑定归零，旧清理不影响新绑定；外部监听保留全部 5 次事件。局部 tsc 与调用真实引擎的 Vitest 通过。 |
| xhigh | 修复 `InventoryWindow` 异步展示生命周期 | 使用既有 `BindingToken.commit`、`presentation` 与精确解绑；局部 tsc、3 文件 34 项相关单测、25 个真实引擎场景通过。覆盖乱序、取消后成功/失败晚到、Hide 复用、Destroy、当前失败传播、重复展示、回调重入和同窗口其他监听/Timer 隔离。 |

引擎证据：`doctor` 与 27 个固定版本源码哈希通过；`test:headless` 使用已安装 3.4.1 CLI 原地构建，发布包通过纯 2D 验证。真实 Headless Chromium + SwiftShader 通过启动、Timer/GLoader/资源/池/UI 探针、100 次创建回收循环和最终场景停机，无 404、console/runtime error。临时实现通过新增的 `test-browser.mjs --probe` 入口直接进入同一真实引擎，不将 mock 当作运行证明；发布输入未变，逐例复用本轮构建。

主线程核阅实现与探针，并独立组合运行两份产物：Node v24.14.0、exit 0、浏览器验收进程耗时 17.6 s。窗口与 root 数量回到 `1/1`，无 pending UI 请求或未处理拒绝。另用 `{passed:false}` 负向控制验证入口确实以 exit 1 拒绝失败结果，非法参数也在启动浏览器前拒绝。

验证产物留在被 Git 忽略的 `temp/codex-forward/v2/`，本机可复跑：

```shell
node temp/codex-forward/v2/verify-combined.mjs
```

这些是有限、可观察的业务执行样例，不是完整游戏、真实鼠标命中/触屏输入或所有任务成功率的证明。

### 失败尝试与计量边界

在独立代理前曾尝试 CLI 工具执行：`gpt-6-astra/low`、CLI 0.153.2，用时 36.3 s，input 47,733（含 cached 31,232）/ output 436（含 reasoning 13）。该会话的文件操作被权限策略拒绝，连只读命令也不能执行，因此没有产物，**不计入通过结果**；CLI exit 0 仅表示正常结束。未放宽权限或将故障隐瞒为模型成功。试跑入口的 `npm exec -- node` 临时解析到了缓存 Node 26.8.1，后续入口已改用现有 `process.execPath`，不再解析 Node 包；原有项目 Node 24.14.0 未替换。

实际完成任务的独立代理接口不提供完整 usage，也未独立计量整个开发过程耗时，因此无法报告两项任务的总 token、平均开发耗时或货币性价比。组合浏览器验收的耗时单独记录在本机 `combined-result.json`，不冒充模型开发耗时。前面的分类用量、失败 CLI 用量与代理执行成本分开记录，不能相互代替。

## 确定性验收

- `check:skills`：27 个公共 Skill，description 2,162 字符；根 AGENTS 2,818 bytes。根预算调整为 3,072 bytes，保留关键继续/暂停条件；公共/游戏 description 预算分别为 2,500/1,000 字符。
- `check:memory`：47 条索引记录；默认 active、显式历史带状态、body-only 查询和游戏作用域有回归测试。补修模型名/版本号被拆成数字造成无关命中的问题：保留连字符、点与下划线标识，支持文件名检索及 NFKC 归一化，6 项检索回归通过。
- `validate:game-workflow`：命名游戏模板 dry-run 通过，未创建真实游戏。
- `test:workflow`：9 文件 48 项通过；`typecheck` 的项目与测试配置均通过。覆盖检索、配置/effort、预算拒绝、评测隔离、游戏生成与同步工具。
- `test:verification`：在无效 Laya/Python 路径下完整 fast profile 通过；该集成检查已从普通测试独立，避免嵌套 verify。
- `framework:manifest` 与 `check:framework-integrity`：475 个共享文件、5 个 JSON 契约通过；新增 npm 命令契约一致，无下游 lock。

开发方式见 [工作流指南](../../Books/LXFamework-Codex-Workflow.md)，复验方法见 [evaluation.md](../.agents/skills/codex-workflow/references/evaluation.md)。

## 未验证项

未运行 macOS、小游戏/商店/Native 验收；真实 Laya Web 发布包已按上述 Headless 补验，本次未修改发布输入或正式发布，不叠加运行 `verify:release`。未验证客户端 UI 切换 Plan 的运行过程，只核验配置和官方字段语义。不同客户端/账户的模型可用性以实际客户端为准。成本优化已落实精简指令、精准检索、按需 Skill 和复用验证证据，但尚无完整真实开发 usage，不能宣布已达到最低成本或各档质量等价。
