# LXFamework Codex 开发工作流

## 仓库与工作目录

Git 仓库根目录是 `LayaLXFamework`，LayaAir 项目与完整 Codex 工作流位于 `LayaProject`。本机依赖由开发人员按 [开发环境说明](LXFamework-Environment.md) 准备，仓库与 Codex 不自动安装系统软件。环境就绪后从项目目录启动 Codex：

```shell
cd LayaProject
npm ci
npm run doctor
```

框架任务从 `LayaProject` 启动。当前游戏任务直接从固定业务根启动：

```shell
codex --cd src/game/logic
```

只有需要增加另一个独立游戏作用域时，才运行 `npm run game:create -- --id my-game` 并从新目录启动。

Codex 对两类文件采用不同的官方发现顺序：`AGENTS.md` 从 Git 根目录向当前目录合并，所以 `LayaProject/AGENTS.md` 先于游戏文件生效，冲突时更近的规则优先；Skills 从当前目录向仓库根扫描，所以公共与游戏 Skills 同时可用。从 `LayaProject` 根启动不会加载游戏层。游戏规则不得复制公共规则，游戏 Skill 使用独立名称。

## 应纳入版本控制的内容

- `Books/`
- `Design/`（Luban Tables、固定工具和生成配置）
- `LayaProject/.agents/`、`.codex/`、`AGENTS.md`
- `assets/`、`src/`、`tests/`、`tools/`、`docs/`
- `engine/`、`settings/`、`.vscode/`
- `LayaProject.laya`、TypeScript/Vitest 配置、`package.json` 与 `package-lock.json`

外层 `.gitignore` 排除 LayaAir 缓存、本机布局、依赖、发布产物、编译 bundle、测试产物、日志与本地密钥。`bin` 不整体排除，仅排除由构建生成的 `bin/js/bundles/`。

## 模型与语义路由

- 模型与推理强度默认值只在 `LayaProject/.codex/config.toml` 维护；用户显式选择优先，Skill 不重置当前模型。
- Codex 默认单代理执行；只有任务跨独立风险边界或用户明确要求时才委派。委派时子代理默认继承主线程模型；用户授权降成本后才显式选择较低档执行模型，最终验收标准不降低。
- 框架目录不是高风险的充分条件：保契约内部修复走最窄领域 Skill；共享 API、生命周期、schema 或工作流语义变化才需要 Change Contract。已批准且边界未变直接实施，不重复索要批准。

请求只需说明业务目标、目标平台、可观察验收结果与硬约束，不需要指定 Skill 名称。Codex 依据各 Skill 的 `description` 选择范围最窄的工作流。

## 公共变更与协作

框架代码位于 `src/framework/`，业务代码位于 `src/game/`。业务实现发现公共能力不足时，先暂停公共边界写入：不能证明稳定复用就保留在 game；能够证明才提交 Change Contract，取得批准后修改 framework 或共享工作流。

框架由一人维护；投入使用后约 2–3 人可能协作，这不表示每个 Codex 任务需要多个代理。多人并行写入时先重新读取目标文件；同一语义区域已被他人修改时停止并报告，不猜测覆盖。`git init`、commit 与 push 只在开发者明确要求时执行。

下游仓库存在 `.framework-lock.json` 时，manifest 管理内容为只读；框架缺口反馈上游，稳定消费等待验证后的 Tag，开发联调可按需同步已提交的 channel snapshot。目录所有权、启动扩展点和同步命令只在 [框架发行与下游同步](../LayaProject/docs/framework-distribution.md) 维护。

## 验证

验证按改动范围选择最小命令；不复制项目，不启动 LayaAirIDE 或可见浏览器。日常快速门禁执行：

```shell
npm run verify
```

`verify` 不检测或调用 Laya CLI、.NET、Python 或浏览器。AGENTS、Skills、memory 与 workflow 由相关路径专用门禁检查；修改 Luban 表后先运行 `npm run tables:generate`，再运行 `npm run tables:check`。普通 JSON 与 Luban 无关，由 `LX.Config` 使用原生 `Loader.JSON` 加载并读取 `TextResource.data`；生成表只通过 `LX.Tables` 访问。

只有改动影响 Laya 发布链或准备正式发布时才执行 `npm run verify:release`。它先检查环境，以最多 3 路并发运行完整静态检查，全部通过后只构建一次，并由 Headless Chromium + SwiftShader 检查真实 LayaAir 3.4.1 2D 发布包。已通过且没有相关文件变化的检查不重复执行。

Windows 与 macOS 共用同一套 AGENTS、Skills 和 npm 命令。普通 push 只在单个 Ubuntu runner 执行快速门禁；发布 Tag 或手动触发时，双平台 CI 才分别执行完整 `npm run verify:release`。

AGENTS、Skill description、路由样例或决策语义变化时，才在开发者已登录的本地 Codex CLI 环境运行一次 `npm run test:skill-routing`；普通 YAML、脚本、测试实现和文档改动只运行确定性 workflow 门禁。语义评测覆盖正向/负向路由与批准、只读、越界、默认单代理及受控委派决策，记录模型和 token；可用 `LX_CODEX_EVAL_MODEL` / `LX_CODEX_EVAL_EFFORT` 显式覆盖。分类成绩不代表真实任务行为，不能替代执行审查。GitHub CI 不调用模型、不读取或要求 `CODEX_API_KEY`。

真实商店、小游戏容器或 Native 签名等无法由 Headless 证明的行为应列为未验证项，不自动切换到 GUI。

## 项目记忆

公共框架经验存放在根 `.codex/memory/`，单个游戏经验存放在 `src/game/<game-id>/.codex/memory/`；从游戏目录启动时两者叠加查询。只记录经验证的长期内容，不记录临时进度、猜测、密钥或大段日志。

## 依据

- [OpenAI：Codex AGENTS.md 分层项目指令](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [OpenAI：Codex 项目配置层级](https://learn.chatgpt.com/docs/config-file/config-basic)
- [OpenAI：Codex Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [LayaAir：项目工程目录说明](https://layaair.com/3.x/doc/basics/IDE/projecFolders/)
- [LayaAir：源码模板导出规则](https://layaair.com/3.x/doc/IDE/layapackage/exportToStore/readme.html)
- [Luban v4.11.0](https://github.com/focus-creative-games/luban/tree/v4.11.0)

人工使用方式和公共 API 见 [项目 README](../README.md)；内部所有权和生命周期边界见 [运行时架构](../LayaProject/docs/architecture.md)。
