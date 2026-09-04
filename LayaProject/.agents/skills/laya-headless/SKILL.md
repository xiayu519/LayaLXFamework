---
name: laya-headless
description: 构建、验证或诊断 LayaAir 3.4.1 CLI、NoRender、Headless Chromium/CDP、发布包、2D 引擎边界和 CI 验收时使用；普通 TypeScript 单测不触发。
---

# Laya Headless Validation

先读 [verification.md](references/verification.md)。

1. 除非开发者明确要求 GUI，所有验证从当前项目根目录以纯 Headless 方式执行；不得复制项目，不启动 LayaAirIDE 或可见浏览器。
2. 使用 `tools/layaair.mjs` 精确调用已安装的 LayaAir 3.4.1 CLI；版本或运行时缺失时保留真实失败。
3. `npm run test:headless` 必须原地构建并由 Headless Chromium + SwiftShader 加载发布包，真实执行 `Laya.init()` 和 ui2 生命周期。
4. 404、反序列化错误、console.error、未处理异常、READY 标记缺失或 3D 库入包均视为失败；不得用 mock 或仅 TypeScript 通过替代。
5. 先运行与改动相关的最小检查；独立检查并行执行，已经通过且没有相关文件变化的检查不重复。修改 Headless 链路后运行专项测试，交付完整验证运行一次 `npm run verify`。
