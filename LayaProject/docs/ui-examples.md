# 可调用 UI 示例

启动模板后点击 **打开旅行背包**，进入旅行背包；顶部的 **居中展示** 打开中央面板。三个窗口分别演示全屏 full 拉伸列表、全屏 mid 居中面板、弹窗 mid 动画，全部保留完整骨架。列表提供选择、确认使用、取消、重置与重开；中央面板提供计数和返回。库存属于当前应用实例，状态页与背包共享，关闭窗口不清空数据。

状态页可以模拟 6 秒后奖励到账、全量快照和旧包重放。初始 100 种物品各 3 件，两个入口红点都显示可用物品总量 300；选择行不改变计数。发出奖励后关闭背包，业务服务仍会更新库存，重新打开读取最新快照。详细数据流见 [数据绑定](ui-data-binding.md)。

这里吸收了所提供 `v_self_002` demo 的预制体组合、Runtime 类型化节点和列表项职责划分思路；代码与界面按当前 LayaAir 3.4.1 / `lx.ui` 契约重新实现，不依赖外部 demo 文件和图片。

## 接入入口

示例属于 `src/game/logic/` 可调用脚本库。模板的 `createGameApplication()` 已注册；命名游戏可在自己的 `configureUI` 中按需调用：

```ts
import { registerUIExamples } from "../../logic/bootstrap/registerUIExamples";

configureUI(ui) {
    const inventoryRoute = registerUIExamples(ui, inventoryContext, deliveryContext);
    // inventoryContext 注入应用服务与其原生事件源；将 route 传给场景页面。
}
```

同一个 router 只注册一次。`inventoryContext` 的构造及服务启停参考 [createGameApplication.ts](../src/game/logic/bootstrap/createGameApplication.ts)；每个应用单独创建服务。场景内使用 BaseGameScene 的 UI 上下文：

```ts
await this.ui.show(inventoryRoute, { title: "旅行背包" });
```

模板注册的 ID 是 `lx.examples.inventory`、`lx.examples.fullscreen-mid` 和 `lx.examples.confirm`。状态页通过 session.ui.show 打开场景独立背包；背包通过 session.show 打开本次展示拥有的确认框与中央面板。场景示例是 registerView 路由，应用 lx.ui.show 保留给 GWindow 系统窗口。

## 示例结构

| 文件 | 职责 |
| --- | --- |
| [registerUIExamples.ts](../src/game/logic/bootstrap/registerUIExamples.ts) | 三条 typed route 的组装与注册 |
| [ExampleInventoryPage.ts](../src/game/logic/presentation/ui/examples/ExampleInventoryPage.ts) | 列表绑定、选择刷新、确认窗口的 owner 清理 |
| [ExampleInventoryView.ts](../src/game/logic/presentation/ui/examples/ExampleInventoryView.ts) | 全屏 `.lh` 根 Runtime 的类型化节点 |
| [ExampleItemView.ts](../src/game/logic/presentation/ui/examples/ExampleItemView.ts) | 每次复用时完整刷新物品 ID、文字、数量和灰态 |
| [ExampleConfirmationPage.ts](../src/game/logic/presentation/ui/examples/ExampleConfirmationPage.ts) | 原生场景弹窗；确认只执行一次，取消与关闭不执行确认回调 |
| [ExampleFullscreenMidPage.ts](../src/game/logic/presentation/ui/examples/ExampleFullscreenMidPage.ts) | 全屏中央面板、原生关闭按钮、展示期计数与解绑 |
| [ExampleInventory.ts](../src/game/logic/domain/ExampleInventory.ts) | 纯模型；稳定 ID、快照/增量校验与版本判断 |
| [ExampleInventoryService.ts](../src/game/logic/infrastructure/examples/ExampleInventoryService.ts) | 功能共享库存、协议入口与原生通知，不依赖 UI；奖励与反馈由独立 ExampleDeliveryService 提供，红点在组合处订阅 |
| [ExampleInventoryContext.ts](../src/game/logic/presentation/ui/examples/ExampleInventoryContext.ts) | 将纯业务操作、事件源及红点 key 注入页面 |

资产位于 `assets/bootstrap/game/ui/examples/`，由现有 `alwaysIncluded: ["bootstrap"]` 收集。用于实际大功能时，应按该游戏的资源布局放入功能包，并更新 route URL。

## 复用预制体

- [ActionButton.lh](../assets/bootstrap/game/ui/examples/ActionButton.lh)：原生 `GButton`、标题绑定和相对尺寸。
- [PanelChrome.lh](../assets/bootstrap/game/ui/examples/PanelChrome.lh)：标题、关闭按钮与底板。全屏页的顶部标题区和确认弹窗引用同一个 Prefab，尺寸变化由 Relation 处理。
- [InventoryItem.lh](../assets/bootstrap/game/ui/examples/InventoryItem.lh)：Radio 模式 `GButton`，由原生 `button` Controller 和 `GearDisplay` 展示选中边框。
- [Inventory.lh](../assets/bootstrap/game/ui/examples/Inventory.lh)：完整声明 `full + safeContent(top / full / mid / bottom)`，mid 留空；标题和汇总归 top，虚拟列表归 safeContent/full，选择信息和操作按钮归 bottom。列表随上下区域和安全区拉伸，行高与字号不变；源资产声明 Scroller、模板节点及宽高 Relation。
- [Confirmation.lh](../assets/bootstrap/game/ui/examples/Confirmation.lh)：根尺寸 `720×1280` 随屏幕拉伸，safeContent/mid 为 `560×390` 内容画布，对应 `center-popup`；frame、文字和按钮全部归入 mid，只有 mid 做开合动画。
- [FullscreenMid.lh](../assets/bootstrap/game/ui/examples/FullscreenMid.lh)：全屏居中面板，top/bottom 放说明，full 留空，mid 复用 PanelChrome 并提供计数交互。

所有窗口固定 Root/full、safeContent(top/full/mid/bottom)，未使用的节点留空。PanelChrome 提供底板、标题和关闭按钮，分别在 Inventory/top、FullscreenMid/mid、Confirmation/mid 复用；窗口显式绑定其嵌套 closeButton。固定节点始终来自 `.lh`。底部按钮通过 Relation 在侧边安全区收窄时保持间距。

## 动态图标

InventoryItem 的嵌套图标引用框架 DynamicImage 组件，来自 supplies/equipment 两个示例图集。每次复用按物品身份换 src。绑定等待图集并检查 token 和加载结果；关闭时解除 itemRenderer、清空可见行动态图片和 idle 行池，重开读取当前库存。动态图集、循环列表、慢加载取消及引擎兼容修复见 [资源生命周期](ui-resource-lifecycle.md)。

## 类型与生命周期

`.lh` 的 `_$runtime` 指向 Runtime 脚本 `.meta`；需要访问的节点设置 `_$var: true`，名称与 IDE 生成字段一致，例如 `itemList: Laya.GList`。原生 Prefab 完成反序列化、路由检查 Runtime 类型后，bind 函数直接使用 view.itemList。Runtime 继承 `.generated.ts`，少量引用可用 @property；生成文件不手改，构造期间不访问未初始化节点，不增加 Binder。

虚拟列表设置 `itemRenderer` 后调用 `setVirtual()`，数据量通过 `numItems` 驱动；更新用 `refreshVirtualList()`。物品 ID 与显示节点分开，渲染时覆盖全部动态状态，不为每一行重复监听点击，也不对虚拟列表手动增删子节点。

点击事件归 session.lifetime，模型刷新通过 session.bindData，红点通过 session.bindRedDot。第一次绑定和页面恢复同步读取快照；后续通知由原生 callLater 合并。确认框由 session.show 归父展示，父关闭清理已显示、隐藏缓存及未完成请求；旧回调不能重复扣减。服务拥有的延迟奖励继续落模型，不依赖窗口 token。销毁后由原生 GList 清空自己的池，不逐条 clearRes()。

场景示例全部挂所属 uiRoot，确认框也不转移到全局 GRoot。center-popup 只动画 mid，场景局部遮罩位于最高模态窗口正下方；navigation:page 控制页面覆盖和恢复，与弹窗布局及模态分别配置。

## 验证

按改动选择相关命令。共享数据与展示绑定的单测为：

```sh
npm test -- tests/game/logic/ExampleInventoryState.test.ts tests/game/logic/ExampleInventoryService.test.ts tests/framework/UIBindings.test.ts tests/framework/SceneUI.test.ts
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
