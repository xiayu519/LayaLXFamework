# Project Memory

仅在任务语义相关时通过 `project-memory.mjs search` 检索，再读取命中的条目。

## Problems

- [Codex CLI routing eval isolation](problems/codex-cli-routing-eval-isolation.md)：旧 CLI 模型缓存与全局插件会破坏或膨胀语义路由评测。
- [Laya Loader.BUFFER TextResource](problems/laya-buffer-text-resource.md)：LayaAir 3.4 二进制加载结果需从 TextResource.data 取出。
- [ui2 default skins in bootstrap](problems/ui2-default-skins-in-bootstrap.md)：关闭默认皮肤总开关后仍需清空默认组件引用，防止 `internal/UI` 扩大首包。

## Decisions

- [Codex model floor](decisions/codex-model-floor.md)：主线程与门禁固定 `gpt-5.6-sol/high`，低风险小任务可用 `gpt-5.6-terra/medium` 执行。
- [Framework/game ownership](decisions/framework-game-ownership.md)：共享 framework 与具体 game 业务物理分离，运行时只公开 `LX`。
- [Repository boundary](decisions/repository-boundary.md)：Git 根目录位于外层，完整 Codex 工作流保留在 `LayaProject` 并从该目录启动。
- [Runtime resource ownership](decisions/runtime-resource-ownership.md)：运行时副作用和资源由 scope/lease 管理，业务先停、共享资源后清。
- [Luban source of truth](decisions/luban-source-of-truth.md)：已被 bootstrap 输出路径的新版本替代。
- [Luban source of truth v2](decisions/luban-source-of-truth-v2.md)：外层 Design 是表源，启动配置生成到 bootstrap，framework 不依赖表结构。
- [Laya resource package layout](decisions/resource-package-layout.md)：以首次可交互为 bootstrap 边界，按功能包组织完整资源依赖。

## Feedback

- [In-place Headless validation](feedback/in-place-headless-validation.md)：验收必须在当前项目原地纯 Headless 执行。
- [Semantic Skill routing](feedback/semantic-skill-routing.md)：业务请求按语义隐式触发窄 Skill，不在 `AGENTS.md` 写死路由。
- [Small-team collaboration](feedback/small-team-collaboration.md)：项目按 2–3 人协作处理，公共化候选和并行冲突必须先停止判断。
- [Laya-focused documentation](feedback/laya-focused-documentation.md)：架构与工作流文档只说明已验证的 LayaAir 规则。
