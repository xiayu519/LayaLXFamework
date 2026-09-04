---
name: laya-headless
description: 构建、验证或诊断 LayaAir 3.4.1 CLI、引擎源码基线、Headless Chromium/CDP、发布包、2D 边界和 CI 验收时使用；普通 TypeScript 单测不触发。
---

# Laya Headless Validation

1. 先读 [references/verification.md](references/verification.md)。除非明确要求 GUI，必须在当前项目原地纯 Headless 执行，不复制项目、不启动 IDE 或可见浏览器。
2. 使用 `tools/layaair.mjs` 精确调用已安装的 3.4.1 CLI；源码行为结论先运行 `npm run check:engine-source`。
3. 最小检查按变更选择；交付完整执行一次 `npm run verify`。静态检查可并行，真实发布构建只执行一次。
4. `test:headless` 必须构建当前项目，并由 Headless Chromium + SwiftShader 加载发布包，真实执行 `Laya.init()`、ui2 和生命周期探针。
5. 404、console/runtime error、3D 库入包、源码漂移或任一探针失败均视为失败，不用 mock 或仅 typecheck 代替。
