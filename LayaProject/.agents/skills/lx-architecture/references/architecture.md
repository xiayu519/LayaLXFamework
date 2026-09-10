# Architecture

## Ownership

```text
src/framework/  多人共享、稳定且已验证的框架能力
src/game/<id>/  命名游戏的玩法、界面、配置与组合根
src/game/logic/ 可调用逻辑脚本库，不是具体游戏
src/AppEntry.ts Laya 原生 main() 启动入口
```

framework 不依赖 game。game 的 domain/application 保持纯净；`src/game/<id>/bootstrap/` 显式组合具体实现。业务运行时只访问 `lx`，不读取 runtime host。

## Existing boundaries

- `lx`：唯一业务门面；res 是原生 Laya.loader，普通原生场景直接用 Laya.Scene，stop() 显式停止应用。
- `AppBootstrap`：顺序启动、逆序回滚与停止、错误聚合。
- 公共 UI 定义在应用组合根登记，不加载；公共事件与服务交给 AppBootstrap。World 只初始化和撤销专属内容，不能注销公共路由。全局数据与其通知不依赖 World；公共 UI 实例仍归 Scene 或父窗口。
- `AppEntry.main()`：在引擎初始化之后启动应用，`CompilerSettings.mainScript` 通过 UUID 引用；不挂载到 Scene，不重复 `Laya.init()`。
- `ContentCatalog`：稳定 ID 到 URL，不管理 Loader 所有权。
- `WorldRegistry`：lx.worlds 只协调定义注册、初始化和逆序撤销；WorldContext 只有 id/signal/own，不持有 Scene/UI 实例。退出先失效再清理，并等待原始初始化及晚到 own。
- `SceneRegistry` / `BaseGameScene`：lx.scenes 按 route 持有原生实例，不同 route 并存，内部 SceneFlow 复用切换事务。用 get(route/id) 取明确实例；Scene 持有自己的 UI。
- `DataRegistry`：lx.data.get(typedKey) 获取组合根预先创建的功能数据；只存引用，不在服务/World/UI 中新建账号模型。协议接收早于 UI，World 退出保留账号数据，账号退出使旧 receiver 失效。
- `SceneUI`：场景 uiRoot 承载 registerView({id,url,bind?,onClosed?}) 注册的原生 GWidget Runtime，含弹窗；session.show 的子 UI 归父展示，session.ui.show 归场景。owner、host、layout 独立，离场清理隐藏缓存和晚到加载。
- `UIRouter` / `BaseGameWindow`：lx.ui 的应用窗口使用原生 GRoot/GWindow；场景不另建 GRoot 或改其默认实例。场景导航、模态、布局、缓存等在静态 UIViewLifecycle 组件中声明；应用 GWindow 保留 UIRoute 创建配置。Runtime 负责逻辑/原生导出字段，IDE 可调参数放静态 Script，不依赖 Runtime 新增属性的编辑保存。
- `LayaGraphicsCleanup` / `UIDynamicImage`：3.4.1 引用缺陷的最小兼容边界，原生加载与池仍保留，见 [资源生命周期](../../../../docs/ui-resource-lifecycle.md)。
- 功能模型按账号/场景寿命组织，任意多个 UI 可订阅，一个 UI 可读多个模型；模型不认识 route 或节点，模拟反馈和协议接收与 UI 命令契约分开。
- `UIBindings`：展示期原生 EventDispatcher 订阅、首次快照和 callLater 合并；不负责业务模型，也不替代 Runtime/IDE 节点引用，见 [数据绑定](../../../../docs/ui-data-binding.md)。
- `RedDotStore` / `RedDotBinding`：`lx.ui.redDots` 的路径聚合与显示订阅；业务先更新模型再发事件、计算红点，不轮询 UI。Laya 事件适配留在 infrastructure/presentation，domain/application 保持纯净。
- `TipQueue`：`lx.ui.tip()` 的 500ms FIFO、Tween 和有界 Prefab 复用。
- `PrefabPoolService`：基于 `Laya.Pool` 的有界 Prefab 实例所有权。
- `JsonConfigService` / `TablesRegistry`：普通 JSON 与 Luban Tables 的独立入口。
- `AudioService`：基于 `SoundManager` 的 handle/owner 业务语义。
- `SaveStore`：schema、版本、校验和迁移。
- `PlatformService` / `PurchasePlatform` / `HttpTransport`：外部边界。
- `StateMachine` / `RenderPerformance`：已验证的通用规则和诊断。

Event、`Laya.timer`、Tween、Pool、Loader、LocalStorage、Scene、SoundManager 和 Spine 组件优先直接使用。新增公共封装必须证明不只是转发、至少有稳定消费者、失败/清理边界和自动化验收；否则保留在 game。
