# 可调用 UI 示例

启动模板后点击 **打开旅行背包**，进入旅行背包；顶部的 **居中展示** 打开中央面板。三个窗口分别演示全屏 full 拉伸列表、全屏 mid 居中面板、弹窗 mid 动画，全部保留完整骨架。列表提供选择、确认使用、取消、重置与重开；中央面板提供计数和返回。库存属于账号，登录消息先于 World 初始化；大厅、背包与战斗页共享，关闭窗口或切换 World 不清空数据。

状态页可以模拟 6 秒后奖励到账、全量快照和旧包重放。初始 100 种物品各 3 件，两个入口红点都显示可用物品总量 300；选择行不改变计数。发出奖励后关闭背包或进入战斗，应用补给服务仍会更新库存，重新打开读取最新快照。详细数据流见 [数据绑定](ui-data-binding.md)。

这里吸收了所提供 `v_self_002` demo 的预制体组合、Runtime 类型化节点和列表项职责划分思路；代码与界面按当前 LayaAir 3.4.1 / `lx.ui` 契约重新实现，不依赖外部 demo 文件和图片。

## 接入入口

示例属于 src/game/logic 可调用脚本库。createGameApplication 先创建账号数据和独立模拟服务器，再安装应用服务；模拟登录数据落地后，GameReadyService 进入大厅 World。

| 阶段 | World / Scene ID | 场景与页面 |
| --- | --- | --- |
| 大厅 | examples.lobby | Lobby.ls / lx.status |
| 战斗 | examples.battle | Battle.ls / lx.examples.battle |

大厅“进入战斗”调用应用组合处的导航流程，先退出大厅 World 再进入战斗。战斗页“返回大厅”执行逆向流程。World 只注册专属 UI/Scene 定义和事件，own 只保存自己的撤销回调；退出由 Scene 卸载其 UI。公共定义、账号库存和待到账奖励继续存在。

公共 UI 在应用组合根登记一次，不加载 Prefab 或实例：

```ts
const inventoryRoute = registerCommonUI(ui, inventoryContext, deliveryContext);
// 公共定义归应用 UIRouter，应用停止时统一清理。
// World 只对自己的页面和 Scene 登记 world.own，不撤销公共路由。
```

依赖组装参考 [createGameApplication.ts](../src/game/logic/bootstrap/createGameApplication.ts)；World 流程参考 [registerExampleWorlds.ts](../src/game/logic/bootstrap/registerExampleWorlds.ts)。场景内打开：

```ts
await this.ui.show(inventoryRoute, { title: "旅行背包" });
```

应用注册公共的 lx.examples.inventory、lx.examples.fullscreen-mid 与 lx.examples.confirm；大厅 World 只注册 lx.status 和 Lobby 场景，战斗 World 只注册战斗页及 Battle 场景。状态页通过 session.ui.show 打开场景独立背包；背包通过 session.show 打开本次展示拥有的确认框与中央面板。退出大厅会销毁其全部实例并撤销专属定义，公共定义仍可在战斗 Scene 中使用。公共注册不改变实例归属；应用 lx.ui.show 保留给 GWindow 系统窗口。

## 示例结构

| 文件 | 职责 |
| --- | --- |
| [UILobby.ts](../src/game/logic/presentation/ui/examples/UILobby.ts) | 大厅示例页；展示账号库存、模拟消息和进入战斗，原 FrameworkStatus 已改名并归入 examples |
| [registerCommonUI.ts](../src/game/logic/bootstrap/registerCommonUI.ts) | 应用生命周期的三条公共 typed route 定义，不加载、不持有实例 |
| [UIInventory.ts](../src/game/logic/presentation/ui/examples/UIInventory.ts) | 静态 Runtime；列表绑定、选择刷新、使用动作、子窗口与展示清理 |
| [UIInventoryItem.ts](../src/game/logic/presentation/ui/examples/UIInventoryItem.ts) | 每次复用时完整刷新物品 ID、文字、数量和灰态 |
| [UIConfirmation.ts](../src/game/logic/presentation/ui/examples/UIConfirmation.ts) | 原生场景弹窗；确认只执行一次，取消与关闭不执行确认回调 |
| [UIBattle.ts](../src/game/logic/presentation/ui/examples/UIBattle.ts) | 战斗场景页面，读取共享账号库存并返回大厅 |
| [UIFullscreenMid.ts](../src/game/logic/presentation/ui/examples/UIFullscreenMid.ts) | 全屏中央面板、原生关闭按钮、展示期计数与解绑 |
| [ExampleInventory.ts](../src/game/logic/domain/ExampleInventory.ts) | 纯模型；稳定 ID、快照/增量校验与版本判断 |
| [ExampleInventoryData.ts](../src/game/logic/infrastructure/examples/ExampleInventoryData.ts) | 引用外层账号模型，提供账号代次接收器与原生通知；模拟命令/奖励由 ExampleDeliveryService 提供 |
| [ExampleInventoryContext.ts](../src/game/logic/presentation/ui/examples/ExampleInventoryContext.ts) | 将纯业务操作、事件源及红点 key 注入页面 |

资产位于 `assets/bootstrap/ui/examples/`：页面放本层，复用组件放 `components/`，空白骨架和列表模板放 `templates/`，不再另设 `template-probe/`。文件、根节点及 Runtime 使用 `UI` 前缀；完整目录见 [UI 模板索引](ui-templates.md)。资产由现有 `alwaysIncluded: ["bootstrap"]` 收集。用于实际大功能时，应按该游戏的资源布局放入功能包，并更新 route URL。

## 复用预制体

- [UIActionButton.lh](../assets/bootstrap/ui/examples/components/UIActionButton.lh)：原生 `GButton`、标题绑定和相对尺寸。
- [UIPanelChrome.lh](../assets/bootstrap/ui/examples/components/UIPanelChrome.lh)：标题、关闭按钮与底板。全屏页的顶部标题区和确认弹窗引用同一个 Prefab，尺寸变化由 Relation 处理。
- [UIInventoryItem.lh](../assets/bootstrap/ui/examples/components/UIInventoryItem.lh)：Radio 模式 `GButton`，由原生 `button` Controller 和 `GearDisplay` 展示选中边框。
- [UIInventory.lh](../assets/bootstrap/ui/examples/UIInventory.lh)：完整声明 `full + safeContent(top / full / mid / bottom)`，mid 留空；标题和汇总归 top，虚拟列表归 safeContent/full，选择信息和操作按钮归 bottom。列表随上下区域和安全区拉伸，行高与字号不变；源资产声明 Scroller、模板节点及宽高 Relation。
- [UIConfirmation.lh](../assets/bootstrap/ui/examples/UIConfirmation.lh)：根尺寸 `720×1280` 随屏幕拉伸，safeContent/mid 为 `560×390` 内容画布，对应 `center-popup`；frame、文字和按钮全部归入 mid，只有 mid 做开合动画。
- [UIBattle.lh](../assets/bootstrap/ui/examples/UIBattle.lh)：战斗全屏页面，完整骨架、共享库存显示与返回大厅按钮。
- [UIFullscreenMid.lh](../assets/bootstrap/ui/examples/UIFullscreenMid.lh)：全屏居中面板，top/bottom 放说明，full 留空，mid 复用 PanelChrome 并提供计数交互。

所有窗口固定 Root/full、safeContent(top/full/mid/bottom)，未使用的节点留空。PanelChrome 提供底板、标题和关闭按钮，分别在 Inventory/top、FullscreenMid/mid、Confirmation/mid 复用；窗口显式绑定其嵌套 closeButton。固定节点始终来自 `.lh`。底部按钮通过 Relation 在侧边安全区收窄时保持间距。

## 动态图标

InventoryItem 的嵌套图标引用框架 UIDynamicImage 组件，来自 supplies/equipment 两个示例图集。每次复用按物品身份换 src。绑定等待图集并检查 token 和加载结果；关闭时解除 itemRenderer、清空可见行动态图片和 idle 行池，重开读取当前库存。动态图集、循环列表、慢加载取消及引擎兼容修复见 [资源生命周期](ui-resource-lifecycle.md)。

## 静态脚本与手动调整

打开预制体，选择根节点查看 Runtime：状态页对应 UILobby，背包对应 UIInventory，确认框对应 UIConfirmation，全屏居中页对应 UIFullscreenMid，战斗页对应 UIBattle。这些脚本直接包含界面交互和刷新，原来的四个外部 Page 绑定脚本已合并移除；InventoryItem 继续使用 UIInventoryItem。

根节点的组件列表中还静态挂有框架 UIViewLifecycle，所有窗口骨架已预置。场景 UI 必须保留并启用它；路由只用 getComponent 获取，漏配或禁用会在展示前报错并销毁该实例。它连接原生启用、禁用与销毁回调，负责暂停数据订阅、恢复快照和直接销毁时的 owner 清理，并在 IDE 中提供 layout/layer/navigation/modal/closeOnMaskClick/multiplicity/retention 窗口参数。

在 IDE 选择根节点下的 UIViewLifecycle 组件修改参数并保存，预览时会读取静态配置；例如 Confirmation 的 closeOnMaskClick、Inventory 的 retention。尺寸、文字和节点关系在预制体中调整。LayaAir 3.4.1 的 Runtime 是运行时替代类型，不能把 Runtime 新增的 @property 当作可保存的根节点属性；需要业务可调字段时使用静态 Script 组件。节点导出仍走 IDE 生成，不手改 .generated.ts。

路由只保留 id/url 和可选 bind/onClosed。Confirmation 和 FullscreenMid 没有 bind，框架调用原生 Runtime.onBind；背包等由 bind 注入依赖并返回 onBind 的结果。onBind 是每次 show 的项目约定，不是 Laya 原生回调；hide 重开会重新绑定。事件、红点和异步清理归 session，不能只等 onDestroy；账号数据不会随关窗销毁。异步工作的原始 Promise 必须返回，框架才可等待底层加载稳定。

应用 Loading 的内容 Runtime 也静态配置；其 GRoot/GWindow 宿主仍由应用路由创建。

## 类型与生命周期

`.lh` 的 `_$runtime` 指向 Runtime 脚本 `.meta`；需要访问的节点设置 `_$var: true`，名称与 IDE 生成字段一致，例如 `itemList: Laya.GList`。原生 Prefab 完成反序列化、框架校验静态 UIViewLifecycle 后，默认调用 Runtime.onBind 或执行依赖注入 bind，由实例直接使用 this.itemList。Runtime 继承 `.generated.ts`，少量引用可放静态 Script 的 @property；生成文件不手改，构造期间不访问未初始化节点，不增加 Binder。

虚拟列表设置 `itemRenderer` 后调用 `setVirtual()`，数据量通过 `numItems` 驱动；更新用 `refreshVirtualList()`。物品 ID 与显示节点分开，渲染时覆盖全部动态状态，不为每一行重复监听点击，也不对虚拟列表手动增删子节点。

点击事件归 session.lifetime，模型刷新通过 session.bindData，红点通过 session.bindRedDot。第一次绑定和页面恢复同步读取快照；后续通知由原生 callLater 合并。确认框由 session.show 归父展示，父关闭清理已显示、隐藏缓存及未完成请求；旧回调不能重复扣减。服务拥有的延迟奖励继续落模型，不依赖窗口 token。销毁后由原生 GList 清空自己的池，不逐条 clearRes()。

场景示例全部挂所属 uiRoot，确认框也不转移到全局 GRoot。center-popup 只动画 mid，场景局部遮罩位于最高模态窗口正下方；navigation:page 控制页面覆盖和恢复，与弹窗布局及模态分别配置。

## 验证

按改动选择相关命令。共享数据与展示绑定的单测为：

```sh
npm test -- tests/game/logic/ExampleInventoryState.test.ts tests/game/logic/ExampleInventoryData.test.ts tests/framework/UIBindings.test.ts tests/framework/SceneUI.test.ts
```

模板、交互或真实引擎行为变化时，再选下面对应检查；这些命令不是每次文档或局部修改的固定收尾：

```sh
npm run typecheck
npm test -- tests/game/logic/ExampleInventory.test.ts tests/framework/UILayoutService.test.ts tests/framework/UIRouter.test.ts tests/framework/BaseGameWindowTransition.test.ts tests/workflow/BrowserProbePlan.test.ts
npm run check:architecture
npm run validate:assets:laya
npm run validate:resource-layout
npm run test:headless -- --suite targeted --probe tests/game/logic/ui-framework.browser.mjs
# 仅布局/宿主/安全区或行尺寸受影响时追加；复用本轮构建。
node tests/game/logic/ui-examples-resolutions.mjs
```

ui-framework.browser.mjs 聚焦原生绑定、宿主、场景归属与数据生命周期；ui-templates.browser.mjs 和分辨率脚本保留模板/适配断言，按影响独立选择，避免全部串进同一个 30 秒预算。

模板专项探针通过浏览器鼠标事件验证启动入口、虚拟列表选择、确认/取消、模态阻挡、重复确认、父窗口关闭、8 次重开及立即取消打开。全屏 mid 示例在同一实例上切换安全区，验证居中、缩小恢复、按钮点击、返回与重开。扫描和运行时同时检查完整节点顺序，保留错误、404 和完整 owner 停机检查。

分辨率矩阵复用上述构建，最多同时运行 2 个 Headless 浏览器，覆盖 `320×568`、`360×640`、`375×667`、`390×844`、`412×915`、`600×800`、`768×1024`、`1280×720`。每个视口均切换普通、刘海/胶囊、侧边安全区和恢复场景，断言槽位归属、背景覆盖、列表上下拉伸、固定行高/字号、底部定位、无重叠/越界，以及重排后的选择、弹窗和重置点击。项目 `screenMode: vertical` 会按引擎规则旋转横向浏览器视口；这验证的是本项目竖屏适配。

单个尺寸可复查：`node tools/test-browser.mjs --suite targeted --probe tests/game/logic/ui-examples.browser.mjs --viewport 390x844`。`--viewport` 设置真实浏览器 CSS 视口；平台刘海和胶囊数据由探针模拟，结束后恢复。

同一构建输入未变时，后续 UI 框架回归可复用发布目录：`npm run test:browser -- --suite framework`。Windows Headless Chromium / SwiftShader 的结果不代表 macOS、小游戏真机或目标 GPU 的性能验收。

模板选择与独立功能资产见 [UI 模板索引](ui-templates.md)；通用 Mask 配置和关闭后钩子见 [布局约定](ui-layout.md)。
