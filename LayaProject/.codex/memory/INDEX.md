# Project Memory

只在任务语义相关时通过 `project-memory.mjs search` 检索，再读取命中条目。

## Problems

- [Laya statistics readiness](problems/laya-statistics-readiness.md)：未发布的统计窗口不能用零值通过预算，GPU 取 driver 计量。
- [Runtime quarantine reference release](problems/runtime-quarantine-reference-release.md)：clean unbind 立即释放；settling 隔离在清理完成后主动解除强引用。
- [HTTP timer overflow](problems/http-timer-overflow.md)：timer 参数限制为 32-bit 上限，retry jitter 最终 cap 到 `maxDelayMs`。

- [Codex CLI routing eval isolation](problems/codex-cli-routing-eval-isolation.md)：旧 PowerShell 评测入口，已由跨平台版本替代。
- [Codex routing eval isolation v2](problems/codex-routing-eval-isolation-v2.md)：固定 Codex CLI 由 Node 跨平台隔离执行并检查 token 预算。
- [Laya Loader.BUFFER TextResource](problems/laya-buffer-text-resource.md)：LayaAir 3.4 二进制加载结果需从 `TextResource.data` 取出。
- [Laya Loader group membership persists](problems/laya-loader-group-membership-persists.md)：group 清理不会移除 URL 成员；旧 ResourcePolicy 规避方案已被原生资源边界替代。
- [ui2 default skins in bootstrap](problems/ui2-default-skins-in-bootstrap.md)：关闭默认皮肤开关后仍需清空组件引用，防止 `internal/UI` 扩大首包。
- [Corrupt save preservation](problems/corrupt-save-preservation.md)：损坏存档恢复默认值时必须保留原始数据并暴露恢复原因。
- [Luban generated text line endings](problems/luban-meta-line-endings.md)：生成 `.meta` 和 TypeScript 必须统一跨平台换行，二进制仍严格比较。
- [Headless CDP runtime portability](problems/headless-cdp-runtime-portability.md)：Node 20 的 CDP 客户端显式依赖 `ws`，不依赖全局 `WebSocket`。
- [Headless asynchronous observation](problems/headless-async-observation.md)：异步生命周期探针轮询后置条件并设置超时，禁止固定短延时猜测完成。
- [Laya Loader.JSON TextResource](problems/laya-json-text-resource.md)：3.4.1 JSON 解析结果位于 `TextResource.data`，不能把 Loader 返回值当裸对象。

## Decisions

- [Laya native runtime boundary](decisions/laya-native-runtime-boundary.md)：先采用已审计的 Laya 原生生命周期，只保留薄业务扩展。
- [Codex model floor](decisions/codex-model-floor.md)：旧固定模型策略，已由单点配置与用户选择优先替代。
- [Codex model policy](decisions/codex-model-policy.md)：默认值单点维护，用户显式选择优先，已批准方案不重复审批。
- [Framework/game ownership](decisions/framework-game-ownership.md)：共享 framework 与具体 game 物理分离，业务只经 `LX`。
- [Repository boundary](decisions/repository-boundary.md)：Git 根目录在外层，完整 Codex 工作流保留在 `LayaProject`。
- [Runtime resource ownership](decisions/runtime-resource-ownership.md)：旧 scope/lease 方案，已由 Laya native runtime boundary 替代。
- [Luban source of truth](decisions/luban-source-of-truth.md)：已被 bootstrap 输出路径的新版本替代。
- [Luban source of truth v2](decisions/luban-source-of-truth-v2.md)：已被 JSON/Tables 分离的新版本替代。
- [Data pipelines v3](decisions/data-pipelines-v3.md)：已被游戏级生成路径的新版本替代。
- [Data pipelines v4](decisions/data-pipelines-v4.md)：JSON/Tables 分离，Luban 输出由当前游戏配置指定。
- [Game workflow layering](decisions/game-workflow-layering.md)：游戏目录追加独立 AGENTS/Skills，并从该目录启动以叠加公共工作流。
- [Cross-platform development workflow](decisions/cross-platform-development-workflow.md)：旧的每次双平台完整 CI，已由分层验证策略替代。
- [Validation profiles](decisions/validation-profiles.md)：日常使用无 Laya CLI 快速门禁，领域与双平台发布验证按风险显式升级。
- [Laya resource package layout](decisions/resource-package-layout.md)：已被 framework/game 启动作用域的新版本替代。
- [Laya resource package layout v2](decisions/resource-package-layout-v2.md)：bootstrap 拆分框架与游戏所有权，功能包仍按依赖边界组织。
- [Framework distribution ownership](decisions/framework-distribution-ownership.md)：旧 Tag-only 同步决定，已由双轨发行模式替代。
- [Framework distribution channels](decisions/framework-distribution-channels.md)：release 使用 Tag，开发 snapshot 显式跟随 channel，并统一锁定不可变 commit。
- [Content asset import policy](decisions/content-asset-import-policy.md)：图片、音频和 Spine 使用固定可执行导入规格与精确例外。
- [HTTP retry idempotency](decisions/http-retry-idempotency.md)：默认不重试；只有幂等请求可进行有限瞬时失败重试。

## Feedback

- [Workflow push gates](feedback/workflow-push-gates.md)：语义输入改动才运行一次本地 CLI 回归；普通工作流只跑确定性门禁。
- [Source-first Laya design](feedback/source-first-laya-design.md)：公共模块必须先审查固定版本源码，禁止重复造引擎轮子。
- [In-place Headless validation](feedback/in-place-headless-validation.md)：验证必须在当前项目原地纯 Headless 执行。
- [Semantic Skill routing](feedback/semantic-skill-routing.md)：业务请求按语义触发窄 Skill，不在 `AGENTS.md` 写死路由。
- [Small-team collaboration](feedback/small-team-collaboration.md)：旧多人维护解释，已由单维护者协作策略替代。
- [Single-maintainer collaboration](feedback/single-maintainer-collaboration.md)：框架单人维护；Codex 默认单代理，团队规模不决定委派数量。
- [Laya-focused documentation](feedback/laya-focused-documentation.md)：只记录已验证的 LayaAir 规则。
