# LXFamework

提案/回答用中文；标识、命令、路径、API、日志保持原样。2–3 人协作；主线与质量门禁用 `gpt-5.6-sol/high`，Plan mode 用 `xhigh`；低风险小任务可用 `sol/medium` 或 `terra/medium`，验收不降级。

业务请求说明目标、平台、可观察验收和硬约束即可。Codex 按 Skill `description` 选择最窄工作流；仅跨独立风险边界时组合，并只读所需 reference。

共享框架在 `src/framework/`，业务在 `src/game/`；framework 不依赖 game，业务只经 `LX`。新游戏放在 `src/game/<game-id>/`；从该目录启动时叠加根与游戏规则，公共和游戏 Skills 同时可用。写前保留他人改动；同一区域并行冲突时停止报告。

开发/工作流兼容 Windows/macOS；本机环境按文档自备，仓库只检测、不安装。工具用跨平台 Node API；差异由双平台 CI 验证。

优先使用 LayaAir 3.4.1 的 Event、`Laya.timer`、Tween、Pool、Loader、LocalStorage、Scene、SoundManager 与 ui2，不建同义管理器或转发层。`LX.Res` 即 `Laya.loader`，`LX.Scene` 即 `Laya.Scene`。固定 UI 节点来自 `.ls/.lh`；异步 UI 回写使用失效令牌。资源先停副作用并销毁 owner，等待加载/渲染稳定后调用 `Laya.Scene.gc()`；禁止业务调用私有资源引用 API。

开发者纠正或公共框架/工作流候选出现时，暂停该公共边界。不能证明跨业务复用与稳定语义则留在 `src/game/`；能证明才提交 Change Contract，批准后继续，并在验证后沉淀长期纠正。

评审和诊断默认只读；实现完成范围内改动与验证。结果不确定先对齐；已批准且边界未变时不重复确认。

除非明确要求 GUI，验证必须在当前项目原地、纯 Headless 执行：不复制项目，不启动 IDE 或可见浏览器。运行时使用 3.4.1 CLI 构建并由 Headless Chromium 检查真实 2D 发布包。完成时报告实际改动、验证结果、未验证项和剩余风险。
