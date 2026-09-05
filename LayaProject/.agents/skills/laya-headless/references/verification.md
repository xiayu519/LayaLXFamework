# Headless Verification

## Commands

- 环境：`npm run doctor`
- 引擎源码：`npm run check:engine-source`
- 静态：`npm run typecheck && npm test && npm run check:architecture`
- 资产：`npm run validate:assets && npm run validate:resource-layout`
- 发布：`npm run build:web && npm run validate:build && npm run test:browser`
- 原地全链路：`npm run test:headless`
- 完整验收：`npm run verify`

成功标准：3.4.1 CLI 原地构建；发布包只含 2D、ui2、Spine 所需库；JSON、Luban Tables 和 `[LX] READY` 正确；真实探针覆盖 Timer、GLoader、共享纹理、Prefab pool、Tip 队列/动画/复用、UI modal/Destroy 与 Startup Scene 停机；无 404、console.error 或未处理异常。

Windows 与 macOS 使用同一 npm 命令和 `~/.layaair` 版本注册结构。本机依赖由开发人员按环境文档准备，仓库只检测、不安装；工具通过 `LAYAAIR_INSTALL_DIR`、`LAYAAIR_IDE_HOME`、`BROWSER_PATH`、`PYTHON_PATH` 覆盖非标准位置。双平台兼容必须由 CI 分别执行一次完整 `npm run verify`，不能共享或复制项目构建结果。

`settings/LayaSourceBaseline.json` 固定官方 v3.4.1 commit 的关键源码哈希，检查直接读取本机 `.js.map` 的 `sourcesContent`，不依赖网络。无代表性 Spine、音频或目标平台资产时，必须列为未验证项，不能自动改用 GUI 或伪造结论。
