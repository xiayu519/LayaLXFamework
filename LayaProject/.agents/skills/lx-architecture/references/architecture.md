# Architecture

## Ownership

```text
src/framework/  多人共享、稳定且已验证的框架能力
src/game/       当前产品的玩法、界面、配置与组合根
src/Main.ts     Laya 启动 Scene 挂载入口
```

framework 不依赖 game。game 的 domain/application 保持纯净；`src/game/bootstrap/` 显式组合具体实现。业务运行时只访问 `LX`，不读取 runtime host。

## Existing boundaries

- `LX`：唯一业务门面；`Res`/`Scene` 分别是原生 `Laya.loader`/`Laya.Scene`。
- `AppBootstrap`：顺序启动、逆序回滚与停止、错误聚合。
- `ContentCatalog`：稳定 ID 到 URL，不管理 Loader 所有权。
- `UIRouter` / `BaseGameWindow`：ui2 route、分层查询、Hide/Destroy 与异步绑定。
- `TipQueue`：`LX.UI.tip()` 的 500ms FIFO、Tween 和有界 Prefab 复用。
- `PrefabPoolService`：基于 `Laya.Pool` 的有界 Prefab 实例所有权。
- `JsonConfigService` / `TablesRegistry`：普通 JSON 与 Luban Tables 的独立入口。
- `AudioService`：基于 `SoundManager` 的 handle/owner 业务语义。
- `SaveStore`：schema、版本、校验和迁移。
- `PlatformService` / `PurchasePlatform` / `HttpTransport`：外部边界。
- `StateMachine` / `RenderPerformance`：已验证的通用规则和诊断。

Event、`Laya.timer`、Tween、Pool、Loader、LocalStorage、Scene、SoundManager 和 Spine 组件优先直接使用。新增公共封装必须证明不只是转发、至少有稳定消费者、失败/清理边界和自动化验收；否则保留在 game。
