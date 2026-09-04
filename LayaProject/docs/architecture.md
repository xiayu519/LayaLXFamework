# Architecture

## 目标

这套基础层服务于 2D、小游戏适配、未来 Android APK/IAP，以及 Codex 全程开发验证。核心原则是“Laya 原生能力优先，业务语义薄封装，纯逻辑可在 Node 测试，引擎行为用 CLI 原地构建和 Headless Chromium 验证”。

## LayaAir 能力边界

| 领域 | LayaAir 3.4.1 主体能力 | 本项目公共契约 |
| --- | --- | --- |
| UI | ui2 `GWindow/GRoot/GWidget`、关系、控制器、Prefab | 路由 ID、参数绑定、层级查询、Hide/Destroy 与异步失效 |
| 资源 | `Laya.loader`、缓存、group、`loadPackage` | 内容 ID、资源所有权、释放边界和分包目录契约 |
| 场景 | `Scene.open/close/destroy/gc` | 稳定 route 与过期导航保护 |
| 音频 | `SoundManager` 的 BGM/SFX/音量/静音 | 幂等句柄、owner 停止与资源 lease |
| 存储 | `LocalStorage` | schema、版本、验证和迁移 |
| 运行时 | Event、Timer、Tween、Pool、HttpRequest | `LX.*` 类型化业务入口与平台契约 |

## 所有权与分层

```text
src/framework/                2–3 人共享的稳定框架层；不得依赖 game
  LX.ts                       唯一运行时业务门面
  domain/                     共享纯规则和时间原语
  application/                共享路由状态与异步失效控制
  infrastructure/             Laya 资源、存储、音频、HTTP、Scene 实现
  platform/                   Web/小游戏/Native/IAP 能力边界
  bootstrap/                  runtime、启动回滚与内部 LX 绑定
  presentation/               可复用 ui2 窗口基础
src/game/                     当前游戏业务；可依赖 framework
  bootstrap/createApplication.ts  当前游戏内容、场景、UI 与服务定义
  generated/                  Luban 生成 schema 与浏览器安全 ByteBuf
  infrastructure/config/      业务表加载与 LX.Config 安装
  presentation/               当前游戏界面
src/Main.ts                   Laya Scene 挂载入口，只进入 game bootstrap 与 LX
```

`tools/check-architecture.mjs` 机器检查 framework/game 所有权、依赖方向、运行时循环、文件规模、类型逃逸、旧 Spine API、纯层边界、`LXRuntimeHost` 调用者和 `LX` 唯一公共门面。`LX` 只引用 runtime 已构造的实例，使业务代码保持 `LX.UI`、`LX.Res`、`LX.Audio`、`LX.Config` 等稳定格式；attach/detach 由 `createRuntime` 的 start/stop 内部完成。项目不使用反射 DI 或全量 ECS。

## 启动与回滚

`AppBootstrap` 按注册顺序启动服务，只有成功启动的服务进入 active 列表。任一服务失败时，已启动服务逆序 stop；回滚错误与原始失败一并保留。正常关闭同样逆序执行，并继续收集 stop 错误。并发 `start`/`stop` 共享进行中的任务；启动期间收到停止请求会等待启动落定后逆序关闭。运行时是一次性的，进入 `stopped` 后不允许复用已释放的 UI/资源重新启动。

当前组合顺序为：

```text
WebPlatform -> RuntimeCleanup -> Preferences/Audio -> GameConfig -> other game services
```

关闭时按相反顺序先停止游戏服务，再失效并销毁 UI，等待在途加载清理，排空 Prefab/Spine/Audio 所有者并释放全部资源组，最后关闭平台服务。设置只在显式 `SaveStore.save()` 时写入，停止阶段不会用启动快照覆盖运行中的新值。

## UI 生命周期

`assets/bootstrap/ui/FrameworkStatus.lh` 是真实 ui2 源资产。`multiple + hide` 会在注册时拒绝，因为隐藏实例既无法确定复用目标，也会造成集合常驻；multiple 路由固定使用 Destroy。运行时流程：

```text
route -> Laya.loader.load(.lh, HIERARCHY + group)
      -> Prefab.create() 必须得到 GWidget
      -> route factory 创建 BaseGameWindow
      -> BindingToken 绑定参数
      -> GWindow.show()
      -> Hide 复用或 Destroy 清理
```

固定节点不在 TypeScript 中创建。`BindingToken` 使旧请求在新的 present、Hide 或 Destroy 后失效，异步结果必须通过 `commit` 才能写 UI。

route 声明 `UILayer`、modal、multiplicity 与 retention；`snapshot/listVisible/listManaged/getTop/getBottom/closeTop` 提供路由视图，但实际显示顺序仍来自 `GRoot`。原生 `GWindow.hide/destroy` 会同步路由记录。窗口 lifetime 与每次 presentation 分开清理；动态图片由 `DynamicTextureBinding` 持有请求失效和 group lease。

## 资源边界

业务代码继续直接调用 `Laya.loader`。`ContentCatalog` 只解决稳定 ID 与物理 URL 解耦；`ResourcePolicy` 登记 group、签发轻量 lease、执行安全 group 清理和读取 `Resource.cpuMemory/gpuMemory`。它不复制 Loader cache，活跃 lease 只用于阻止提前卸载。

Laya 构建器不会从任意字符串 URL 推导动态资源依赖。启动资源统一位于 `assets/bootstrap` 并进入 `BuildSettings.alwaysIncluded`；业务资源按 `assets/packages/<feature>/<type>` 分包，共享资源按 `assets/shared/<domain>/<type>` 分包。目录、跨包引用和 `subpackages` 配置由 `validate:resource-layout` 检查，完整规则见 [resource-layout.md](resource-layout.md)。

正确释放顺序是：失效异步任务，解绑监听/计时，销毁显示对象，清理 group，最后回收未使用资源。内存 snapshot 用来诊断，不用来强行清理仍被引用的资源。

`PrefabPoolService` 负责有界实例复用、重置、非法归还和排空；`SpineService` 使用 `Sprite + Spine2DRenderNode`；`AudioService` 以 handle/owner 管理声道。三者都通过 lease 连接到相同释放边界。`RenderPerformance` 读取真实 Laya statAgent；UI 层级不承诺合批，性能以发布运行时 DrawCall/triangle 预算为准。

## Luban 配置

外层 `Design/config` 是人工源，固定 Luban 生成 `src/game/generated/config/schema.ts` 与 `assets/bootstrap/config/game/*.bin`。`config:check` 在系统临时目录重生成并逐字节检查，不复制项目。LayaAir 3.4 的 `Loader.BUFFER` 返回 `TextResource`，`GameConfigService` 读取其 `data` 后用纯浏览器 ByteBuf 解析，并安装到泛型 `LX.Config`；framework 不依赖具体表结构。

## 存档、平台与 IAP

`SaveStore` 保存 `{ version, data }` envelope。旧版本逐步迁移，校验失败回到默认值；遇到高于当前客户端的版本会抛出 `UnsupportedSaveVersionError`，不会覆盖未来格式。

平台、购买和 HTTP 使用显式契约。`src/game/bootstrap/createApplication.ts` 向 framework `createRuntime(definition, adapters)` 提供当前游戏定义与适配器；未传入适配器时使用 Web、unsupported IAP 和 Laya HTTP 默认实现。当前 Web IAP 为 `UnsupportedPurchasePlatform`，调用必然抛出 `PurchaseUnsupportedError`。以后 Android/小游戏实现替换适配器，不改变领域逻辑，也不允许用模拟 receipt 冒充支付成功。

Socket 重连策略暂不实现：退避、心跳、鉴权恢复、幂等和消息顺序依赖真实协议。当前只提供 HTTP 契约与 Laya `HttpRequest` 实现。

## 验证分层

1. Node 单测验证纯逻辑、回滚、迁移和过期导航。
2. architecture/assets/resource-layout checker 验证依赖方向、UUID、引用、固定 UI 来源、首包边界与分包配置。
3. Laya CLI 官方解析器验证资产，并从当前项目原地构建 Web 发布产物。
4. 产物检查确认动态资源齐全，只包含 core、2D 渲染及 ui2 所需引擎库，不包含 `laya.d3`/`*_3D`。
5. CDP Headless Chromium + SwiftShader 运行真实发布包，确认最终画面、Luban 表值、`LX.UI`、Spine 服务和启动页渲染预算，并拒绝 404、加载失败、`console.error` 与运行时异常。

验证过程中不启动 IDE、不创建项目副本；临时目录仅用于隔离浏览器 profile。`release/web` 是当前项目的发布产物，不是第二份源工程。
