# LXFamework Codex 开发工作流

## 仓库与工作目录

Git 仓库根目录是 `LayaLXFamework`，LayaAir 项目与完整 Codex 工作流位于 `LayaProject`。本机依赖由开发人员按 [开发环境说明](LXFamework-Environment.md) 准备，仓库与 Codex 不自动安装系统软件。环境就绪后从项目目录启动 Codex：

```shell
cd LayaProject
npm ci
npm run doctor
```

框架任务从 `LayaProject` 启动。创建具体游戏时执行：

```shell
npm run game:create -- --id my-game
codex --cd src/game/my-game
```

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

- 主线程和任务门禁：`gpt-5.6-sol/high`。
- Plan mode：`xhigh`。
- 低风险、局部、边界明确且可直接验收的小任务，可使用 `gpt-5.6-sol/medium` 或 `gpt-5.6-terra/medium`；验收标准不降低。
- 框架/公共契约、工作流、持久化 schema、IAP、安全和跨模块决策不降级。

请求只需说明业务目标、目标平台、可观察验收结果与硬约束，不需要指定 Skill 名称。Codex 依据各 Skill 的 `description` 选择范围最窄的工作流。

## 公共变更与协作

框架代码位于 `src/framework/`，业务代码位于 `src/game/`。业务实现发现公共能力不足时，先暂停公共边界写入：不能证明稳定复用就保留在 game；能够证明才提交 Change Contract，取得批准后修改 framework 或共享工作流。

2–3 人协作时，写入前重新读取目标文件。同一语义区域已被他人修改时停止并报告，不猜测覆盖。`git init`、commit 与 push 只在开发者明确要求时执行。

## 验证

除非开发者明确要求 GUI，验证始终在当前 `LayaProject` 原地、纯 Headless 执行；不复制项目，不启动 LayaAirIDE 或可见浏览器。

```shell
npm run verify
```

修改 Luban 表后先运行 `npm run tables:generate`；CI/交付的 `tables:check` 会在系统临时目录重生成并逐字节检查陈旧输出，不复制 Laya 项目。普通 JSON 与 Luban 无关，由 `LX.Config` 使用原生 `Loader.JSON` 加载并读取 `TextResource.data`；生成表只通过 `LX.Tables` 访问。

完整验证先检查环境，再并行运行 Tables 复现、类型、单测、架构、资产、资源分包、性能契约、游戏工作流、Skill 和记忆检查，全部通过后只构建一次，并由 Headless Chromium + SwiftShader 检查真实 LayaAir 3.4.1 2D 发布包。已通过且没有相关文件变化的检查不重复执行。

Windows 与 macOS 共用同一套 AGENTS、Skills 和 npm 命令；平台差异只由工具内部的可执行文件发现处理，双平台 CI 分别执行完整 `npm run verify`。

真实商店、小游戏容器或 Native 签名等无法由 Headless 证明的行为应列为未验证项，不自动切换到 GUI。

## 项目记忆

验证过的踩坑、开发者反馈和架构决定存放在 `.codex/memory/`。只检索与当前任务相关的条目；不记录临时进度、猜测、密钥或大段日志。

## 依据

- [OpenAI：Codex AGENTS.md 分层项目指令](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [OpenAI：Codex 项目配置层级](https://learn.chatgpt.com/docs/config-file/config-basic)
- [OpenAI：Codex Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [LayaAir：项目工程目录说明](https://layaair.com/3.x/doc/basics/IDE/projecFolders/)
- [LayaAir：源码模板导出规则](https://layaair.com/3.x/doc/IDE/layapackage/exportToStore/readme.html)
- [Luban v4.11.0](https://github.com/focus-creative-games/luban/tree/v4.11.0)

人工使用方式和公共 API 见 [项目 README](../README.md)；内部所有权和生命周期边界见 [运行时架构](../LayaProject/docs/architecture.md)。
