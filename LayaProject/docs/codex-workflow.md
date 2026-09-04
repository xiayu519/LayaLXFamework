# Codex 工作流

从 `LayaProject` 根目录启动 Codex。主线程与质量门禁为 `gpt-5.6-sol/high`，Plan mode 为 `xhigh`；边界明确的小任务可使用 `sol/medium` 或 `terra/medium`，但验收标准不降低。

业务只需说明目标、平台、可观察验收结果和硬约束。Skill 由 `description` 语义触发；`AGENTS.md` 不维护硬编码路由表。跨公共框架、契约、schema、生成规则或工作流的 Deep 改动先输出 Change Contract 并取得批准。业务中发现公共候选时，先证明跨业务复用、稳定语义、Laya 无等价能力、失败边界与验证方式；否则留在 `src/game/`。

可复用的踩坑、开发者纠正和架构决定写入 `.codex/memory/`；只在任务相关时检索，只有验证后才新增记录。

## 验证

除非明确要求 GUI，全部验证都在当前项目原地、纯 Headless 执行，不复制工程、不启动 IDE 或可见浏览器。

```powershell
npm run check:engine-source
npm run typecheck
npm test
npm run check:architecture
npm run validate:content-assets
npm run test:headless
npm run verify
```

`npm run verify` 先执行环境检查和可并行静态门禁，全部通过后只执行一次完整 Headless 发布链路。`test:headless` 直接调用 LayaAir 3.4.1 CLI 构建当前项目，再由 CDP Headless Chromium + SwiftShader 验证真实 `Laya.init()`、ui2、资源引用、Luban、渲染预算与停机清理。

GitHub Actions 只执行无需本机 LayaAir CLI 的可移植静态门禁；最终交付仍以开发机原地 `npm run verify` 的源码基线和真实发布包 Headless 结果为准。语义路由使用一次隔离的 `gpt-5.6-sol/high` 评测，并约束输入/输出 token 上限。

## Git

不自动初始化、commit 或 push。若开发者明确要求提交，先复查 Git 根目录、ignore、待提交文件和验证结果；英文 commit message，不混入无关改动。
