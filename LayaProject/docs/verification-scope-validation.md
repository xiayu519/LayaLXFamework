# 验证粒度优化验收

日期：2026-09-08；环境：Windows、LayaAir 3.4.1、Headless Chromium/SwiftShader。此记录是本次证据，不是每次开发的必跑清单。

## 变更边界

- 根规则、领域 Skill、工作流/同步文档改为按影响选检查，取消工作流四组检查和同步后快速回归的无条件绑定。
- 浏览器支持命名组及必须携带行为探针的 `targeted`；默认完整模式、启动检查、错误监听、场景停机与发布门禁保留。
- 模型评测支持案例/分组筛选；无效选择失败，保留竞争 Skill；新增验证过量、不足和证据失效案例。
- 未改模型默认值、授权规则、游戏模板或运行时代码。没有实现按 Git 行数自动挑选测试；类型检查、共享 UUID 等必要全局约束不降级。

## 确定性与真实引擎证据

- `npm test -- tests/workflow/BrowserProbePlan.test.ts tests/workflow/CodexWorkflow.test.ts`：2 文件、33 项通过；覆盖默认全量、分组隔离、参数失败、错误传播与模型子集的缺失/多余/重复结果。
- `npm run typecheck`：应用与测试配置通过。`check:skills`：27 个 Skill，根规则 3005/3072 bytes，description 2162/2500 字符；不等同 token。
- 规则章节按需注入后只复验受影响的 `CodexWorkflow.test.ts`（19 项）与类型检查，未重跑未变的浏览器单测。`check:memory`：48 条；`check:framework-integrity`：485 个 managed files；变更文档的 103 个本地链接、active 记忆检索与 `git diff --check` 通过。
- `test:headless -- --suite targeted --probe tests/workflow/fixtures/browser-targeted.mjs`：本轮唯一原地构建成功，发布包验证通过；真实 ui2 点击与 owner 移除断言通过，启动和停机无错误。
- `node tools/test-browser-suites.mjs`：复用上述未变构建。独立 `network`、`framework`、默认 `all` 通过；非通过探针和 `console.error` 均被拒绝。各次约 2.2s、7.7s、18.0s、2.0s、2.2s；专项与完整覆盖不同，不把耗时差冒充等价质量提速。

## 模型与独立执行

固定本地 Codex CLI 0.153.2，单轮 ephemeral、read-only、无工具，expected 不进入提示：

| effort | 选择范围 | 结果 | input / output tokens | 耗时 |
| --- | --- | --- | --- | --- |
| `medium`，初轮 | 6 个相关路由、1 个证据复用决策、10 个验证范围案例 | 17/17 | 21533 / 246 | 18.1s |
| `low`，初轮 | 10 个验证范围案例 | 10/10 | 18997 / 158 | 14.8s |
| `medium`，最终 | 默认全套：40 路由、17 决策、10 验证范围 | 67/67 | 22477 / 894 | 35.2s |
| `low`，最终 | 10 个验证范围案例 | 10/10 | 17929 / 158 | 13.6s |

验证范围案例含文档、普通注释、局部 TS、依赖方向、Skill 语义、记忆、构建复用/失效、单行发布链变更与无变化不重跑。初轮后减少验证提示中无关章节；同一组 Light 案例的 input 从 18997 降到 17929。此数字仅代表这组分类调用，不代表游戏开发总成本。

本次改变评测选择器、输出协议和规则加载，故在最终版本额外验证一次默认全套入口的兼容性与预算；普通局部规则调整仍选择子集。未执行全模型档位矩阵，不用不同案例数量比较档位效率。

另以当前规则向独立代理提供真实 README 更新任务，仅开放该文件写入，未提供预期验证命令。代理实际只检查差异、npm 命令和本地链接，没有运行 typecheck、测试、模型评测或构建。其文档随后由主代理精简；该样例不代表所有开发任务或所有档位的执行成功率。

## 限制

本次修改验证入口，故专项检查了它的完整模式；没有运行无关的整组工作流测试、游戏回归、`verify` 或 `verify:release`。未验证 macOS、真实小游戏容器、Native 或商店发布；未计量整个开发会话与独立代理的总 token，不能保证所有下游任务都不会过量验证。
