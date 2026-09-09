# Project Memory

只在需要既往经验时通过 `project-memory.mjs search` 检索。条目是线索，采用前核对当前规则与证据；过时内容直接清理，历史查 Git。

## Problems

- [Laya statistics readiness](problems/laya-statistics-readiness.md)：未发布的统计窗口不能用零值通过预算，GPU 取 driver 计量。
- [Runtime quarantine reference release](problems/runtime-quarantine-reference-release.md)：clean unbind 立即释放；settling 隔离在清理完成后主动解除强引用。
- [HTTP timer overflow](problems/http-timer-overflow.md)：timer 参数限制为 32-bit 上限，retry jitter 最终 cap 到 `maxDelayMs`。

- [Codex routing eval isolation v2](problems/codex-routing-eval-isolation-v2.md)：固定 Codex CLI 由 Node 跨平台隔离执行并检查 token 预算。
- [Laya Loader.BUFFER TextResource](problems/laya-buffer-text-resource.md)：LayaAir 3.4 二进制加载结果需从 `TextResource.data` 取出。
- [ui2 default skins in bootstrap](problems/ui2-default-skins-in-bootstrap.md)：关闭默认皮肤开关后仍需清空组件引用，防止 `internal/UI` 扩大首包。
- [Corrupt save preservation](problems/corrupt-save-preservation.md)：损坏存档恢复默认值时必须保留原始数据并暴露恢复原因。
- [Luban generated text line endings](problems/luban-meta-line-endings.md)：生成 `.meta` 和 TypeScript 必须统一跨平台换行，二进制仍严格比较。
- [Headless CDP runtime portability](problems/headless-cdp-runtime-portability.md)：历史 Node 20 缺少全局 WebSocket；CDP 的 `ws` 依赖背景。
- [Headless asynchronous observation](problems/headless-async-observation.md)：异步生命周期探针轮询后置条件并设置超时，禁止固定短延时猜测完成。
- [Laya Loader.JSON TextResource](problems/laya-json-text-resource.md)：3.4.1 JSON 解析结果位于 `TextResource.data`，不能把 Loader 返回值当裸对象。

## Decisions

- [Laya native runtime boundary](decisions/laya-native-runtime-boundary.md)：先采用已审计的 Laya 原生生命周期，只保留薄业务扩展。
- [Data pipelines v5](decisions/data-pipelines-v5.md)：JSON/Tables 分离；模板表逻辑进入 logicRoot，命名游戏可显式使用自己的生成目录。
- [Named game workspaces](decisions/named-game-workspaces.md)：logic 只提供可调用脚本；用户命名业务后才创建英文游戏目录和独立 Codex 层。
- [Local validation and GitHub sync-only contract](decisions/local-validation-github-sync-only.md)：GitHub 只校验框架同步；本机环境与全部开发、领域和发布验收均留在本地。
- [Laya resource package layout v2](decisions/resource-package-layout-v2.md)：bootstrap 拆分框架与游戏所有权，功能包仍按依赖边界组织。
- [Framework distribution channels](decisions/framework-distribution-channels.md)：release 使用 Tag，开发 snapshot 显式跟随 channel，并统一锁定不可变 commit。
- [Content asset import policy v3](decisions/content-asset-import-policy-v3.md)：Spine 3.8 JSON 在合法 Spine 目录按内容与版本自动校验，不再逐文件登记例外。
- [HTTP retry idempotency](decisions/http-retry-idempotency.md)：默认不重试；只有幂等请求可进行有限瞬时失败重试。

## Feedback

- [GPT-6 effort compatibility](feedback/gpt6-effort-compatibility.md)：各标准档位共用工作流，Medium 只是可覆盖的个人选择。
- [Risk-scoped validation](feedback/risk-scoped-validation.md)：按影响选最小充分验收，保留原地 Headless 与可追溯构建复用。
- [Single-maintainer collaboration](feedback/single-maintainer-collaboration.md)：框架单人维护；Codex 默认单代理，团队规模不决定委派数量。
- [Laya-focused documentation](feedback/laya-focused-documentation.md)：只记录已验证的 LayaAir 规则。
