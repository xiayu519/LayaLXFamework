# Headless verification

项目、IDE 与 CLI 必须精确匹配 LayaAir `3.4.1`。npm 命令通过 `tools/layaair.mjs` 调用该版本 `cli-main.js`，不模糊回退。

除非开发者明确要求 GUI，所有验证从当前项目根目录以纯 Headless 方式执行，不复制项目，不启动 LayaAirIDE 或可见浏览器。

## Commands

- 环境：`npm run doctor`
- 类型/单测/边界：`npm run typecheck && npm test && npm run check:architecture`
- 源资产：`npm run validate:assets`
- Web 构建：`npm run build:web && npm run validate:build`
- CDP：`npm run test:browser`
- 原地全链路：`npm run test:headless`
- 配置复现：`npm run config:check`
- 完整验收：`npm run verify`

Headless 成功标准：当前项目直接调用 3.4.1 CLI 构建；发布包只加载 2D 引擎库；Headless Chromium + SwiftShader 执行真实 `Laya.init()` 与 ui2；界面状态为 `READY`，Luban `.bin` 查询正确，`LX.UI`、Spine 和渲染统计可用且启动页预算通过，console 出现 `[LX] READY`，且没有 404、反序列化、console.error 或未处理异常。

`npm run verify` 先检查环境，再并行运行相互独立的静态检查，全部通过后只运行一次真实发布链路。没有相关文件变化时不重复已通过的检查。

NoRender 专项也必须真实执行 `Laya.init()` 和 ui2 生命周期，不能以纯 mock 代替。真实商店、小游戏容器和 Native 签名行为不属于浏览器 Headless 能证明的范围，应单独报告，不自动改用 GUI。
