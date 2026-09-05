# LXFamework

提案/回答用中文；标识、命令、路径、API、日志保持原样。框架由一人维护，使用时约 2–3 人协作；Codex 默认单代理，仅跨独立风险边界或用户明确要求时委派。模型默认值只在 `.codex/config.toml` 维护，用户显式选择优先；子代理默认继承主线程，验收不降级。

业务请求说明目标、平台、可观察验收和硬约束。Codex 按 Skill `description` 选最窄工作流；仅跨独立风险边界时组合，只读所需 reference。

共享框架在 `src/framework/`，业务根 `src/game/logic/` 不得删除；framework 不依赖 game，业务只经 `LX`。新游戏放在 `src/game/<game-id>/`，从其目录启动以叠加公共/游戏规则与 Skills。写前保留他人改动；同一区域并行冲突时停止。

根目录存在 `.framework-lock.json` 即为下游消费模式：禁止手改 manifest 管理文件和 lock；缺口反馈上游，只同步已确认 Tag 或已提交的 channel snapshot。

Windows/macOS 共用；环境自备，本地只检测并引导。优先 Node 跨平台 API；差异本地验收，GitHub 只校验同步契约。

优先使用 LayaAir 3.4.1 的 Event、`Laya.timer`、Tween、Pool、Loader、LocalStorage、Scene、SoundManager 与 ui2，不建同义层。`LX.Res`/`LX.Scene` 即原生对象。固定 UI 来自 `.ls/.lh`；异步回写用失效令牌。资源先停副作用并销毁 owner，稳定后 `Laya.Scene.gc()`；禁用私有引用 API。

纠正或公共候选出现时暂停边界；不能证明复用与稳定语义则留在 game，能证明才提交 Change Contract，批准后继续，验证后沉淀。

评审/诊断默认只读；实现完成改动与验证。结果不确定先对齐；已批准且边界未变不重复确认。

验证按变更选最小命令。`npm run verify` 不调用 Laya CLI；仅发布链改动或正式发布跑原地 `verify:release`，执行 3.4.1 Headless 构建。禁复制项目或启动 GUI；报告结果、未验证项和风险。
