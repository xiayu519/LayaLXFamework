# LXFamework

提案/回答用中文；标识、命令、路径、API、日志保持原样。框架由一人维护，使用时约 2–3 人协作；Codex 默认单代理，仅跨独立风险边界或用户明确要求时委派。模型默认值只在 `.codex/config.toml` 维护，用户显式选择优先；子代理默认继承主线程，验收不降级。

业务请求说明目标、平台、可观察验收和硬约束。Codex 按 Skill `description` 选最窄工作流；仅跨独立风险边界时组合，只读所需 reference。

共享框架在 `src/framework/`，业务在 `src/game/`；framework 不依赖 game，业务只经 `LX`。新游戏放在 `src/game/<game-id>/`，从该目录启动以叠加公共/游戏规则与 Skills。写前保留他人改动；同一区域并行冲突时停止。

根目录存在 `.framework-lock.json` 即为下游消费模式：禁止手改 manifest 管理文件和 lock；缺口反馈上游，只同步已确认版本。

Windows/macOS 共用框架与工作流；环境自备，仓库只检测。工具优先跨平台 Node API，差异由双平台 CI 验证。

优先使用 LayaAir 3.4.1 的 Event、`Laya.timer`、Tween、Pool、Loader、LocalStorage、Scene、SoundManager 与 ui2，不建同义层。`LX.Res`/`LX.Scene` 即原生对象。固定 UI 来自 `.ls/.lh`；异步回写用失效令牌。资源先停副作用并销毁 owner，稳定后 `Laya.Scene.gc()`；禁用私有引用 API。

纠正或公共候选出现时暂停边界；不能证明复用与稳定语义则留在 game，能证明才提交 Change Contract，批准后继续，验证后沉淀。

评审/诊断默认只读；实现完成改动与验证。结果不确定先对齐；已批准且边界未变不重复确认。

除非明确要求 GUI，验证在当前项目原地纯 Headless：不复制项目，不启动 IDE/可见浏览器。用 3.4.1 CLI 构建并由 Headless Chromium 检查真实 2D 包。报告改动、结果、未验证项和风险。
