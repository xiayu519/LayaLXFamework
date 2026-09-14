# 框架发行与下游同步

## 所有权

仓库根没有 `.framework-lock.json` 时是上游开发模式；存在 lock 时是下游消费模式。`framework.manifest.json` 定义同步范围，lock 记录上次同步的来源基线。它们不再将下游框架文件设为只读。涉及框架类型或公共功能时，开发工作流先提示开发者选择在上游分支修改，还是直接在当前项目修改；同一已选范围不重复确认。纯游戏局部实现不触发这个选择。

| 框架同步范围 | 游戏维护范围 |
| --- | --- |
| `src/framework/**`、`src/AppEntry.ts` 及其 `.meta` | `src/game/**`（含 IDE 生成的 Runtime 字段） |
| 通用资源加载与 UI 生命周期代码 | `assets/bootstrap/**`、`assets/packages/**`、`assets/shared/**`，包括 Startup、Tip、Loading |
| 根 `.agents/**`、`.codex/**`、`AGENTS.md` | `src/game/<game-id>/AGENTS.md`、`.agents/**`、`.codex/memory/**` |
| `tools/**`、`tests/framework/**`、`tests/workflow/**` | `tests/game/**`、游戏专属工具 |
| `Design/tools/**`、`Design/genBin.*` | `Design/Tables/**`、`.github/CODEOWNERS` |

`package.json`、`LayaProject.laya`、`PlayerSettings.json`、`CompilerSettings.json`、`ResourceLayout.json` 和 `tsconfig.json` 归下游维护，但 manifest 会校验框架依赖的最小 JSON 字段；下游可添加游戏字段，不能删除或改写公共契约。`CompilerSettings.mainScript` 必须引用 `AppEntry.ts.meta` 的 UUID，其余编译选项保留。`PlayerSettings.json` 的公共契约只约束框架所需模块、ui2 插件和 Spine 版本，不包含 `resolution`；同步会保留每个项目自己选择的 `designWidth`、`designHeight`、`scaleMode` 和 `screenMode`。

## 启动扩展点

启动资源采用 `bootstrap/<type>`，不再区分 framework/game。默认资产随完整项目模板提供，后续由游戏维护，框架同步不会复制覆盖；Loading 的具体 Runtime、IDE 生成字段和展示实现也在 `src/game/logic/presentation/ui/`。应用显式传入 `tipPrefabUrl`，按需提供 `createSceneLoadingPresenter`；不提供 Loading 时框架照常管理场景，不额外创建默认界面。

旧项目迁移到 ResourceLayout version 2 时，在自己的同步分支合并启动资源目录并保留 `.meta` UUID，更新资源 URL、动态图集 prefix、Tables 输出位置，删除 `bootstrapScopes`。同步会保留旧 lock 曾管理的启动资源并解除其锁定，不自动删除或猜测移动游戏文件；迁移后由游戏确认资源和 Runtime 引用。已退役的框架代码、工具等仍按原同步规则清理。

```text
Laya.init() → AppEntry.main()
  → StartupScene.openStartup()：先显示固定 Loading
  → lx.init(GameApplication)：唯一框架初始化入口
  → 全局数据和红点同步完成 → initialWorld → Lobby UI
  → 销毁 Startup

GameStartup.ts 选择游戏配置与 StartupScene；框架模块全部在 lx.ts 初始化。
```

`AppEntry.ts` 使用 Laya 原生启动脚本入口，负责去重启动和失败回滚，不重复初始化引擎；停机调用 `await lx.stop()`。应用生命周期不依赖 `Startup.ls`，销毁业务场景或启动展示场景不会停止应用。IDE 的“启动场景预览”执行配置的 `main()`；“当前场景预览”只打开当前资产，需要应用服务时应切回启动预览。`logic` 不是游戏目录；固定桥接与命名游戏组合都归下游，framework 不依赖 game。

游戏桥接改为 src/game/bootstrap/GameStartup.ts，导出 GameApplication 配置类和 StartupScene。AppEntry 直接调用 lx.init，不再调用运行时工厂。升级到本版的下游需迁移这个游戏所有的桥接文件，并按 ApplicationConfig 实现 register/initialize/synchronization/dispose。当前模板配置保留在 logic/bootstrap/GameApplication.ts，明确使用开发模拟器，真实游戏需接入自己的协议。

## 发布与同步

正式发布时，上游完成 `npm run verify:release`、提交并创建不可变 SemVer Tag。下游可以在独立同步分支执行，便于审阅和回退：

```shell
git switch -c sync/framework-0.2.0
cd LayaProject
npm run framework:sync -- --ref v0.2.0
npm run check:framework-integrity
```

开发期不需要为每批提交创建 Tag。需要联调最新 `main` 时，下游执行：

```shell
git switch -c sync/framework-main-20260905
cd LayaProject
npm run framework:sync -- --channel main
npm run check:framework-integrity
```

同步后必查完整性，再按同步差异选择验收：纯说明/工作流不附带游戏回归；代码变化跑类型检查与相关测试，跨模块或依赖更新再用 `verify`。真实引擎语义按 [Headless 范围](../.agents/skills/laya-headless/references/verification.md) 选探针；发布链变化或正式发布用 `verify:release`，不先重复跑它已包含的快速检查。

同步工具从 manifest 复制发行文件，更新 `.framework-lock.json` 中的 repository、来源模式与 ref、commit、manifest 哈希及逐文件 SHA-256，并合并最小 JSON 契约。release 模式锁定 Tag；snapshot 模式在同步时解析 channel 最新提交并固定该 commit，channel 后续推进不会改变已有下游。若 npm 契约变化，下游在同步分支更新 `package-lock.json`。游戏回归通过后才合并主分支。

第一次建立下游仓库时仍建议从一个已发布 Tag 创建完整项目并设置自己的 `origin`，再对同一 Tag 执行一次 `framework:sync` 生成初始 lock。之后可以同步更高的已发布版本，也可以按需显式更新 `main` snapshot；下游不会在上游 push 时自动漂移。

`check:framework-integrity` 对下游受管文件的修改、新增、删除和 manifest 差异输出 `Framework local changes:`，正常退出，不修改 lock。必要的 Laya/TypeScript JSON 契约和 lock 格式仍需有效。`check:framework-upstream` 只核对 lock 声称的真实来源，因此当前项目的代码修改可以通过，伪造来源仍会失败。唯一的 GitHub Workflow 只执行这些同步契约检查，不安装或检测 LayaAir、.NET、Python、浏览器与 Codex CLI；游戏验证由开发者在本地按需完成。

## 本地修改与覆盖确认

开发提示发生在工作流中，不是游戏运行时弹窗：涉及框架类型或公共功能时，询问“在框架上游分支改更合适，还是直接在当前项目改？”选择当前项目后可以修改原受管文件并运行相关验证；选择上游后进入对应上游分支实现。已明确的选择在同一范围内持续有效。lock 保留上次同步来源，不把本地修改伪装成上游发布内容。

下一次同步会先列出将被覆盖、删除或恢复的本地差异，包括已提交修改、本地新增和本地删除；存在冲突时在写入前停止。开发者可先保留并合并差异，或明确选择替换后为原同步命令添加 `--overwrite-local`。这个确认只保护实际文件内容，允许下游修改本身不需要绕过检查。

`.github/CODEOWNERS` 不再随框架同步；旧 lock 曾管理的该文件会保留并移交游戏维护。上游仓库自己的审查配置仍归上游维护，下游是否使用 CODEOWNERS、分支保护由开发者决定。为保证 snapshot 可重现，上游 channel 应保留已发布 commit 的可达性，避免改写历史。
