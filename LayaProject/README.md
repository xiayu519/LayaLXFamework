# LXFamework

面向 Codex/Headless 开发的 LayaAir `3.4.1` 2D 客户端基础项目，提供可验证的运行时边界与小团队 AI 工作流。

框架全名固定为 `LXFamework`，业务代码使用缩写入口：`LX.UI`、`LX.Res`、`LX.Audio`、`LX.Net`、`LX.Storage`、`LX.Scene`、`LX.Platform`。`LX` 只暴露组合根中已存在的实例，不重复实现 Laya 内建管理器。

## 快速开始

```powershell
npm install
npm run doctor
npm run verify
```

预览项目：

```powershell
npm run preview
```

CLI 被精确固定到 `%USERPROFILE%\.layaair\3.4.1`。`tools/layaair.mjs` 直接运行该版本的 `cli-main.js`，不会在缺失时回退到其他已安装版本。

`npm run doctor` 会在检测到 `D:\Soft\Laya\LayaAirIDE` 时校验 IDE、CLI 与项目类型定义一致；其他安装位置可通过 `LAYAAIR_IDE_HOME` 指定。

## 基础能力

- 类型化统一入口：`LX.*`
- Luban TypeScript-bin 配置：`Design/config` → `LX.Config`
- 有序启动、失败逆序回滚、并发安全停止和一次性生命周期：`AppBootstrap`
- ui2 路由、singleton Hide/Destroy、multiple Destroy：`UIRouter`、`BaseGameWindow`
- 异步关闭后不回写 UI：`AsyncBindingGuard`
- 内容 ID、URL 与资源 group：`ContentCatalog`
- Laya 首包、功能资源分包与包体检查：`settings/ResourceLayout.json`
- 分组释放和 CPU/GPU 内存快照：`ResourcePolicy`
- 存档版本、校验与迁移：`SaveStore`
- BGM/SFX 业务语义：`AudioService`
- 分层 UI 查询、动态纹理所有权、有界 Prefab 池、Spine2D 句柄与渲染预算
- 场景导航过期保护：`SceneRouter`
- 可注入的 Web/小游戏/Native 与 IAP 边界：`PlatformService`、`PurchasePlatform`
- HTTP 基础契约：`HttpTransport`
- 确定性模拟时间与服务器时间：`SimulationClock`、`ServerClock`

框架不重复封装 Laya 已提供的 Event、Timer、Tween、Pool、Loader、LocalStorage、Scene、SoundManager 与 ui2 窗口栈。

## 验证命令

| 命令 | 验证内容 |
| --- | --- |
| `npm run doctor` | Node、Laya/CLI、ui2、TypeScript、启动场景 |
| `npm run config:generate` | 从外层 `Design` 生成 TypeScript schema 与 `.bin` |
| `npm run config:check` | 临时目录重生成并检查提交产物是否陈旧 |
| `npm run typecheck` | Laya 运行时代码类型 |
| `npm test` | 纯逻辑与生命周期单元测试 |
| `npm run check:architecture` | 分层依赖、内建管理器、静态 UI 红线 |
| `npm run validate:assets` | `.ls/.lh/.meta` 引用及 Laya 官方解析器 |
| `npm run validate:resource-layout` | 首包、功能包、共享包、跨包引用与 Spine 共置 |
| `npm run analyze:packages -- --build-root <目录>` | 统计目标平台主包与资源分包体积 |
| `npm run check:skills` | 项目 Skill 的结构与语义路由约束 |
| `npm run build:web` | LayaAir 3.4.1 Web 构建 |
| `npm run validate:build` | 动态 UI 入包及纯 2D 引擎库检查 |
| `npm run test:browser` | CDP Headless Chromium、`LX.UI`、状态与 404/异常 |
| `npm run test:headless` | 当前项目原地构建、纯 2D 产物审计和真实 Headless 运行 |
| `npm run verify` | 环境检查、并行静态检查和一次真实 Headless 发布验收 |

设计取舍见 [docs/architecture.md](docs/architecture.md)，资源落点见 [docs/resource-layout.md](docs/resource-layout.md)，Codex 使用方式见 [docs/codex-workflow.md](docs/codex-workflow.md)。
