# Architecture

## Ownership

```text
src/framework/  多人共享、稳定且可验证的框架能力
src/game/       当前产品的玩法、界面、配置与组合根
src/Main.ts     Laya 挂载入口
```

framework 不能依赖 game。game 的 domain/application 仍保持纯净；`src/game/bootstrap/` 是唯一允许组合 framework 具体实现的业务入口。运行时业务只访问 `LX`，`LXRuntimeHost` 仅由 framework 的门面与 runtime factory 使用。

## Dependency direction

```text
domain <- application <- presentation
   ^           ^              ^
   +------ infrastructure ----+
   +--------- platform -------+
                 ^
             bootstrap
```

- `domain`：确定性规则与时间模型，不认识 Laya。
- `application`：用例、路由状态与异步失效控制，不认识 Laya。
- `presentation`：ui2 窗口和显示绑定，可使用 Laya；不得反向依赖 bootstrap/platform。
- `infrastructure`：Laya Loader、存储、音频、HTTP、Scene 等实现。
- `platform`：Web、小游戏、Native 与 IAP 能力契约和实现。
- framework `bootstrap`：构造稳定 runtime 并定义有序启动、逆序回滚及 LX 内部绑定。
- game `bootstrap`：提供当前游戏内容、场景、UI 和服务定义。

## Existing boundaries

- `AppBootstrap`：顺序启动，失败逆序回滚；停止时继续收集错误。
- `LX`：唯一运行时业务入口；不公开 attach/detach。
- `ContentCatalog`：稳定业务 ID 到 URL/group 的纯映射。
- `UIRouter` / `BaseGameWindow`：singleton/multiple 与 hide/destroy。
- `SceneRouter`：版本化导航；Laya 实现在 infrastructure。
- `SaveStore`：版本、校验、迁移；未来版本拒绝覆盖。
- `PlatformService` / `PurchasePlatform` / `HttpTransport`：外部边界。
- `SimulationClock` / `ServerClock`：确定性本地时间与服务器时间偏移。

优先直接使用 Laya 的 Event、Timer、Tween、Pool、Loader、LocalStorage、Scene、SoundManager 和 ui2 生命周期。不创建只转发的同义管理器，不引入反射 DI 或全局 ServiceLocator。
