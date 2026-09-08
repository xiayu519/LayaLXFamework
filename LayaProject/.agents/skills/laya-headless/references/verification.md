# Headless Verification

## Commands

- 环境：`npm run doctor`
- 引擎源码：`npm run check:engine-source`
- 静态：`npm run typecheck`、`npm test -- <相关测试文件>`；依赖边界变化加 `npm run check:architecture`
- 静态资产：`npm run validate:assets && npm run validate:resource-layout`
- Laya 源资产解析：`npm run validate:assets:laya`
- 发布：`npm run build:web && npm run validate:build && npm run test:browser`
- 原地全链路：`npm run test:headless`
- 快速门禁：`npm run verify`
- 完整发布验收：`npm run verify:release`

成功标准：3.4.1 CLI 原地构建；发布包只含 2D、ui2、Spine 所需库；JSON、Luban Tables 和 `[LX] READY` 正确；真实探针覆盖 Timer、GLoader、共享纹理、Prefab pool、Tip 队列/动画/复用、UI modal/Destroy 与 Startup Scene 停机；无 404、console.error 或未处理异常。

Windows 与 macOS 使用同一 npm 命令和 `~/.layaair` 版本注册结构。本机依赖由开发人员按环境文档准备，仓库只检测、不安装；工具通过 `LAYAAIR_INSTALL_DIR`、`LAYAAIR_IDE_HOME`、`BROWSER_PATH`、`PYTHON_PATH` 覆盖非标准位置。运行时/资源专项用 `test:headless`；发布链改动或正式发布用 `verify:release`，两者均含构建，不叠加重复运行。GitHub Actions 只校验框架同步契约。

`settings/LayaSourceBaseline.json` 固定官方 v3.4.1 commit 的关键源码哈希，检查直接读取本机 `.js.map` 的 `sourcesContent`，不依赖网络。无代表性 Spine、音频或目标平台资产时，必须列为未验证项，不能自动改用 GUI 或伪造结论。

## 临时执行探针

已有本轮成功构建且发布输入未变时，`node tools/test-browser.mjs --probe <trusted-local-module.mjs>` 可额外验证临时任务产物；源代码或资产的发布输入变化仍须重建。模块只用于受信任的本地验证，默认导出 `(validation) => expressionString`；表达式在真实 Laya/LX 启动后执行，依赖须显式嵌入，不捕获 Node 闭包。探针应断言可观察行为并清理自己的 owner，返回 `{ passed: true, ...结果 }`；异常、非通过结果、30 秒超时及浏览器错误均失败。原有探针与场景停机检查保留，不把这条命令当作未构建改动的发布验收。
