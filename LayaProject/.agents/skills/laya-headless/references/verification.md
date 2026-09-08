# Headless Verification

## Commands

- 环境：`npm run doctor`
- 引擎源码：`npm run check:engine-source`
- 静态：`npm run typecheck`、`npm test -- <相关测试文件>`；依赖边界变化加 `npm run check:architecture`
- 静态资产：`npm run validate:assets && npm run validate:resource-layout`
- Laya 源资产解析：`npm run validate:assets:laya`
- 发布：`npm run build:web && npm run validate:build && npm run test:browser`
- 原地全链路：`npm run test:headless`
- 全项目快速回归（非局部任务默认）：`npm run verify`
- 完整发布验收：`npm run verify:release`

共同标准：3.4.1 CLI 原地构建；发布包只含 2D、ui2、Spine 所需库；JSON、Luban Tables 和 `[LX] READY` 正确；Startup Scene 停机回收 owner；无 404、console.error 或未处理异常。完整探针另覆盖 Timer、GLoader、共享纹理、Prefab pool、Tip 队列/动画/复用、网络与 UI modal/Destroy 循环。

Windows 与 macOS 使用同一 npm 命令和 `~/.layaair` 版本注册结构。本机依赖由开发人员按环境文档准备，仓库只检测、不安装；工具通过 `LAYAAIR_INSTALL_DIR`、`LAYAAIR_IDE_HOME`、`BROWSER_PATH`、`PYTHON_PATH` 覆盖非标准位置。发布链改动或正式发布用 `verify:release`，不再叠加含构建的 `test:headless`。GitHub Actions 只校验框架同步契约。

`settings/LayaSourceBaseline.json` 固定官方 v3.4.1 commit 的关键源码哈希，检查直接读取本机 `.js.map` 的 `sourcesContent`，不依赖网络。无代表性 Spine、音频或目标平台资产时，必须列为未验证项，不能自动改用 GUI 或伪造结论。

## 探针范围与构建复用

`test:headless` 和 `test:browser` 共用以下参数；npm 转发需加 `--`：

| `--suite` | 范围 |
| --- | --- |
| `all`（默认） | 全部内置探针；发布验收保留此默认 |
| `lifecycle` | Timer、GLoader 换图、共享纹理、Prefab pool、Tip 生命周期 |
| `network` | 真实 HTTP、序列化、超时、取消及渲染统计断言 |
| `framework` | ui2 布局、绑定、modal 与 100 次 UI/Pool 循环 |
| `targeted` | 只运行 `--probe <module.mjs>` 的专项行为；缺少 probe 报错 |

局部行为选择能覆盖风险的已有组；现有组不覆盖或明显过宽时使用专项 probe。共享 owner/多域影响扩大到相关组或 `all`，不因改动行数少而降低覆盖。任何 suite 都保留启动、错误监听和场景停机检查；报告实际范围，不把启动成功当作业务验收。

无本轮构建证据或发布输入（源代码、资产、依赖、构建配置）变化时，用 `npm run test:headless -- --suite targeted --probe <trusted-local-module.mjs>` 构建一次并验证。已有本轮成功构建且上述输入未变时，用 `node tools/test-browser.mjs --suite targeted --probe <module.mjs>` 复用，不重建；报告构建来源。单独 `--probe` 保持向后兼容，仍在完整探针后追加执行。

模块只用于受信任的本地验证，默认导出 `(validation) => expressionString`；表达式在真实 Laya/LX 启动后执行，依赖须显式嵌入，不捕获 Node 闭包。探针须断言本次可观察行为/失败边界、清理自己的 owner 并返回 `{ passed: true, ...结果 }`；异常、非通过结果、30 秒超时及浏览器错误均失败。不得借复用验收未构建的改动。

仅探针选择器/浏览器入口变化时，跑 `tests/workflow/BrowserProbePlan.test.ts`，再用 `test:headless -- --suite targeted --probe tests/workflow/fixtures/browser-targeted.mjs` 验证构建转发；复用此构建运行 `node tools/test-browser-suites.mjs`，检查分组独立性、完整模式与故意失败的拦截。该集成检查不进入普通 Vitest，领域业务任务不附带运行。
