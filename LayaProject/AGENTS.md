# LXFamework

提案/回答用中文，先给结果，简洁说明证据；标识、命令、路径、API、日志保持原样。用户当前明确指令优先于项目规则和 Skill 指南。

从会话、代码和配置补齐目标、平台、可观察验收与硬约束。评审/诊断只读；实施请求完成改动与必要验证。范围内可逆细节自行决定；只问无法查明且会实质改变结果的问题。中途纠正立即纳入，状态询问不丢失原目标；已批准且边界未变不重复确认。

按 Skill description 选最窄工作流，只读所需 reference。新共享 API、生命周期、schema、生成规则或工作流语义需明确授权；公共候选先证明稳定复用，否则留在当前 game。仅暂停尚未授权的边界，继续独立工作；因 Skill 停顿时链接具体条款并解释。

框架一人维护、约 2–3 人协作。Codex 默认单代理；仅跨独立风险边界且有收益或用户要求时委派，隔离写入区域。模型默认仅在 `.codex/config.toml`，显式选择优先，Skill 不切换模型或强度；子代理继承，验收不降级。写前复读，保留他人改动；无法避开的同区域冲突停止报告。commit/push 等 Git 写操作需用户要求。

`src/framework/` 不依赖 game，业务只经 `LX`。`src/game/logic/` 是不可删除的可调用脚本库，不是游戏。用户开始业务并命名后，将名称译为英文 kebab-case，用 `npm run game:create -- --name <原名> --id <id>` 创建 `src/game/<id>/` 业务与 Codex 层；领域路径均相对此游戏，游戏间不互相依赖。

根目录存在 `.framework-lock.json` 即下游模式：禁止手改 manifest 管理文件和 lock；缺口反馈上游，只同步已确认 Tag 或已提交的 channel snapshot。

优先 LayaAir 3.4.1 原生 Event、timer、Tween、Pool、Loader、LocalStorage、Scene、SoundManager、ui2，不建同义层。`LX.Res`/`LX.Scene` 即原生对象。固定 UI 来自 `.ls/.lh`；异步回写用失效令牌。先停副作用、销毁 owner，稳定后 `Laya.Scene.gc()`；禁用私有引用 API。

验证按风险选最小范围：TS 改动跑 typecheck 和 `npm test -- <相关测试文件>`，依赖边界变化加 check:architecture；领域专项按 Skill。新增测试证明行为/失败边界，不复刻实现；通过后仅相关变化或新失败才重跑。`npm run verify` 是无 Laya CLI 的快速门禁；发布链改动或正式发布才跑原地 `verify:release`。真实引擎行为按需 Headless，禁复制项目或启动 GUI。

Windows/macOS 共用，优先 Node 跨平台 API；环境自备，仓库只检测。独立检查最多 3 路并行；GitHub 只校验同步契约。报告改动、验证结果与未验证项，平台兼容不得由单平台结果推断。
