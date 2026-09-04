# LXFamework

面向 Codex 与纯 Headless 开发的 LayaAir `3.4.1` 2D 客户端基础项目，包含小团队协作工作流、Luban 配置链路及可验证的运行时扩展。

业务统一使用 `LX`：`LX.UI`、`LX.Res`、`LX.Scene`、`LX.Audio`、`LX.Pool`、`LX.Config`、`LX.Storage`、`LX.Net`、`LX.Platform`。其中 `LX.Res === Laya.loader`，`LX.Scene === Laya.Scene`；框架不重复包装 Laya 已有能力。

## 快速开始

```powershell
npm install
npm run doctor
npm run verify
```

CLI 固定使用 `%USERPROFILE%\.layaair\3.4.1`。若存在 `D:\Soft\Laya\LayaAirIDE`，`npm run doctor` 还会校验 IDE、CLI 与项目类型定义一致。

## 已提供能力

- `AppBootstrap`：顺序启动、逆序回滚、并发安全停止与聚合错误。
- `UIRouter` / `BaseGameWindow`：ui2 路由、7 级渲染层、modal、singleton/multiple、Hide/Destroy、栈查询与异步失效保护。
- `PrefabPoolService`：基于 `Laya.Pool` 的 Prefab 异步创建、有界容量、所有权、重置、排空与晚到加载处理。
- `AudioService`：基于 `SoundManager` 的 BGM、SFX、设置、幂等 handle 与 owner 批量停止。
- `ContentCatalog`：稳定内容 ID 到物理 URL 的只读映射。
- `SaveStore`、`HttpTransport`、`StateMachine`、`RenderPerformance` 与平台契约。
- `Design/config` → Luban TypeScript-bin → `LX.Config`。
- `assets/bootstrap`、`assets/packages/<feature>/<type>`、`assets/shared/<domain>/<type>` 的首包/分包目录约束。

Spine 使用 `.lh` 中的 `Spine2DRenderNode` 组件与其 `source`，场景使用 Laya 原生 `Scene`；框架不提供平行的 Spine 或 Scene 管理器。

## 关键验证

| 命令 | 内容 |
| --- | --- |
| `npm run check:engine-source` | 校验本机 3.4.1 source map 内嵌源码与官方审计基线 |
| `npm run typecheck` / `npm test` | TypeScript 与单元测试 |
| `npm run check:architecture` | 分层、循环依赖、私有引擎 API、文件规模等红线 |
| `npm run validate:assets` | `.ls/.lh/.meta` 与官方解析链路 |
| `npm run validate:resource-layout` | 首包、分包、跨包引用与 Spine 共置 |
| `npm run test:headless` | 原地构建、发布包检查和真实 Headless Chromium 探针 |
| `npm run verify` | 环境、静态门禁与一次完整 Headless 验收 |

设计见 [docs/architecture.md](docs/architecture.md)，资源目录见 [docs/resource-layout.md](docs/resource-layout.md)，Codex 用法见 [docs/codex-workflow.md](docs/codex-workflow.md)。
