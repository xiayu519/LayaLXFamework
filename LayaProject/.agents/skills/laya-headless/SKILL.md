---
name: laya-headless
description: 专项构建、验证或诊断 LayaAir 3.4.1 CLI、源码基线、Headless Chromium/CDP、发布包与 CI 时使用；领域任务仅调用已有验收命令及普通 TypeScript 单测不触发。
---

# Laya Headless Validation

1. 先读 [references/verification.md](references/verification.md)。除非明确要求 GUI，必须在当前项目原地纯 Headless 执行，不复制项目、不启动 IDE 或可见浏览器。
2. 使用 `tools/layaair.mjs` 精确调用已安装的 3.4.1 CLI；源码行为结论先运行 `npm run check:engine-source`。
3. 按 reference 选择验证范围；`verify` 是全项目快速回归，不是局部任务默认收尾。发布链或正式发布用 `verify:release`；本轮同一发布输入只构建一次，不叠加 `test:headless`。
4. `test:headless -- --suite <范围>` 构建当前项目，用 Headless Chromium + SwiftShader 执行所选真实探针；启动、错误监听和 owner 停机检查始终保留。省略 suite 为完整探针；局部通过不代表全套通过。
5. 404、console/runtime error、3D 库入包、源码漂移或任一探针失败均视为失败，不用 mock 或仅 typecheck 代替。
