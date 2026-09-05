# Project Memory

只在任务语义相关时通过 `project-memory.mjs search` 检索，再读取命中条目。

## Problems

- [Codex CLI routing eval isolation](problems/codex-cli-routing-eval-isolation.md)：旧 CLI 模型缓存与全局插件会破坏或膨胀语义路由评测。
- [Laya Loader.BUFFER TextResource](problems/laya-buffer-text-resource.md)：LayaAir 3.4 二进制加载结果需从 `TextResource.data` 取出。
- [Laya Loader group membership persists](problems/laya-loader-group-membership-persists.md)：group 清理不会移除 URL 成员；旧 ResourcePolicy 规避方案已被原生资源边界替代。
- [ui2 default skins in bootstrap](problems/ui2-default-skins-in-bootstrap.md)：关闭默认皮肤开关后仍需清空组件引用，防止 `internal/UI` 扩大首包。
- [Corrupt save preservation](problems/corrupt-save-preservation.md)：损坏存档恢复默认值时必须保留原始数据并暴露恢复原因。
- [Luban meta line endings](problems/luban-meta-line-endings.md)：生成 `.meta` 的陈旧检查必须忽略 Git 跨平台换行转换。
- [Laya Loader.JSON TextResource](problems/laya-json-text-resource.md)：3.4.1 JSON 解析结果位于 `TextResource.data`，不能把 Loader 返回值当裸对象。

## Decisions

- [Laya native runtime boundary](decisions/laya-native-runtime-boundary.md)：先采用已审计的 Laya 原生生命周期，只保留薄业务扩展。
- [Codex model floor](decisions/codex-model-floor.md)：主线程与门禁固定 `gpt-5.6-sol/high`，低风险小任务可使用 medium 执行模型。
- [Framework/game ownership](decisions/framework-game-ownership.md)：共享 framework 与具体 game 物理分离，业务只经 `LX`。
- [Repository boundary](decisions/repository-boundary.md)：Git 根目录在外层，完整 Codex 工作流保留在 `LayaProject`。
- [Runtime resource ownership](decisions/runtime-resource-ownership.md)：旧 scope/lease 方案，已由 Laya native runtime boundary 替代。
- [Luban source of truth](decisions/luban-source-of-truth.md)：已被 bootstrap 输出路径的新版本替代。
- [Luban source of truth v2](decisions/luban-source-of-truth-v2.md)：已被 JSON/Tables 分离的新版本替代。
- [Data pipelines v3](decisions/data-pipelines-v3.md)：普通 JSON 与 Luban Tables 分离，分别由 `LX.Config` 和 `LX.Tables` 管理。
- [Game workflow layering](decisions/game-workflow-layering.md)：游戏目录追加独立 AGENTS/Skills，并从该目录启动以叠加公共工作流。
- [Laya resource package layout](decisions/resource-package-layout.md)：以首次可交互为 bootstrap 边界，按功能包组织完整资源依赖。
- [Content asset import policy](decisions/content-asset-import-policy.md)：图片、音频和 Spine 使用固定可执行导入规格与精确例外。
- [HTTP retry idempotency](decisions/http-retry-idempotency.md)：默认不重试；只有幂等请求可进行有限瞬时失败重试。

## Feedback

- [Source-first Laya design](feedback/source-first-laya-design.md)：公共模块必须先审查固定版本源码，禁止重复造引擎轮子。
- [In-place Headless validation](feedback/in-place-headless-validation.md)：验证必须在当前项目原地纯 Headless 执行。
- [Semantic Skill routing](feedback/semantic-skill-routing.md)：业务请求按语义触发窄 Skill，不在 `AGENTS.md` 写死路由。
- [Small-team collaboration](feedback/small-team-collaboration.md)：项目按 2–3 人协作处理，公共候选和冲突先停下判断。
- [Laya-focused documentation](feedback/laya-focused-documentation.md)：只记录已验证的 LayaAir 规则。
