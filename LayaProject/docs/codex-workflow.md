# Codex 工作流

从 `LayaProject` 根目录启动 Codex。主线程和任务门禁固定为 `gpt-5.6-sol/high`，Plan mode 为 `xhigh`，输出详细度为 `low`。

本项目按 2–3 人小团队协作处理。Codex 写入前复查目标文件并保留其他成员改动；若同一语义区域发生并行冲突，停止并报告，不自动覆盖。

## 请求方式

直接说明业务目标、平台、可观察验收结果和硬约束。Codex 根据项目 Skill 的 `description` 自动选择最窄工作流；请求中不需要写 Skill 名称。只有同一任务确实跨越独立风险边界时才组合 Skill，并按需读取 reference。

框架、公共契约、持久化 schema、生成规则、Codex 工作流和高回滚成本改动先进行只读对齐并取得 Change Contract 批准；普通且边界明确的实现直接完成。

业务开发中若出现纠正或公共能力候选，只暂停候选共享边界：先检查真实消费者、稳定语义、Laya 现有能力、失败/生命周期边界和验证方式。不能证明公共性就保留在 `src/game/`；能够证明才提出 `src/framework/` 变更契约。

已通过门禁且低风险、局部、可直接验收的小任务可语义触发独立执行 Skill，并交给 `gpt-5.6-terra/medium` 子代理；主线程复查改动并完成验收。极小任务直接执行，避免委派开销。共享框架/契约、工作流、schema、IAP、安全和跨模块决策不降级。

## 项目记忆

可复用的踩坑、开发者反馈和架构决定存放在 `.codex/memory/`。任务开始时只搜索与目标相关的条目；验证后仅记录有证据、未来可能复用的信息，不记录临时进度、猜测、密钥或大段日志。

```powershell
npm run check:memory
node .agents/skills/project-memory/scripts/project-memory.mjs search headless
```

## 验证

除非开发者明确要求 GUI，所有验证均在当前项目原地、纯 Headless 执行，不复制项目，不启动 IDE 或可见浏览器。

- 快速静态验收：`npm run typecheck && npm test && npm run check:architecture`
- 源资产：`npm run validate:assets`
- 首包与资源分包：`npm run validate:resource-layout`
- 真实发布链路：`npm run test:headless`
- 日常完整验收：`npm run verify`
- 工作流语义路由变更：`npm run test:skill-routing`
- Luban 表变更：`npm run config:generate && npm run config:check`

`npm run verify` 先检查环境，并行执行相互独立的静态检查，全部通过后只运行一次 `test:headless`。已通过且没有相关文件变化的检查不重复执行。

`test:headless` 直接调用 LayaAir 3.4.1 CLI 构建当前项目，再由 Headless Chromium + SwiftShader 执行真实 `Laya.init()`、ui2 生命周期、Luban 二进制查询和渲染预算，并检查 404、console/runtime 错误及纯 2D 发布边界。Headless 无法证明的真机平台行为列为未验证项，不自动改用 GUI。

## Git 边界

Git 仓库根目录为外层 `LayaLXFamework`，Codex 工作流完整保留在 `LayaProject`。`git init`、commit 和 push 只在开发者明确要求时执行。
