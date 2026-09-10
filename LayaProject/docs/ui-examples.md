# 可调用 UI 示例

启动模板后点击 **打开 UI 示例**，进入旅行背包；顶部的 **全屏 mid 示例** 打开中央面板。三个窗口分别演示全屏 full 拉伸列表、全屏 mid 居中面板、弹窗 mid 动画，全部保留完整骨架。列表提供物品选择、确认使用、取消、重置与重开；中央面板提供计数按钮和返回。数据只保存在当前窗口内。

这里吸收了所提供 `v_self_002` demo 的预制体组合、Runtime 类型化节点和列表项职责划分思路；代码与界面按当前 LayaAir 3.4.1 / `LX.UI` 契约重新实现，不依赖外部 demo 文件和图片。

## 接入入口

示例属于 `src/game/logic/` 可调用脚本库。模板的 `createGameApplication()` 已注册；命名游戏可在自己的 `configureUI` 中按需调用：

```ts
import { registerUIExamples } from "../../logic/bootstrap/registerUIExamples";

configureUI(ui) {
    const inventoryRoute = registerUIExamples(ui);
    // 将 inventoryRoute 传给自己的菜单窗口，保留参数类型。
}
```

同一个 router 只注册一次。运行时通过 `LX` 打开：

```ts
await LX.UI.show(inventoryRoute, { title: "旅行背包" });
```

模板注册的 ID 是 `lx.examples.inventory`、`lx.examples.fullscreen-mid` 和 `lx.examples.confirm`；控制台也可调用 `LX.UI.show("lx.examples.inventory", { title: "旅行背包" })`。

## 示例结构

| 文件 | 职责 |
| --- | --- |
| [registerUIExamples.ts](../src/game/logic/bootstrap/registerUIExamples.ts) | 三条 typed route 的组装与注册 |
| [ExampleInventoryWindow.ts](../src/game/logic/presentation/ui/examples/ExampleInventoryWindow.ts) | 列表绑定、选择刷新、确认窗口的 owner 清理 |
| [ExampleInventoryView.ts](../src/game/logic/presentation/ui/examples/ExampleInventoryView.ts) | 全屏 `.lh` 根 Runtime 的类型化节点 |
| [ExampleItemView.ts](../src/game/logic/presentation/ui/examples/ExampleItemView.ts) | 每次复用时完整刷新物品 ID、文字、数量和灰态 |
| [ExampleConfirmationWindow.ts](../src/game/logic/presentation/ui/examples/ExampleConfirmationWindow.ts) | 确认只执行一次，取消与关闭不执行确认回调 |
| [ExampleFullscreenMidWindow.ts](../src/game/logic/presentation/ui/examples/ExampleFullscreenMidWindow.ts) | 全屏中央面板、原生关闭按钮、展示期计数与解绑 |
| [ExampleInventory.ts](../src/game/logic/presentation/ui/examples/ExampleInventory.ts) | 无引擎依赖的示例数据；按稳定 ID 更新数量 |

资产位于 `assets/bootstrap/game/ui/examples/`，由现有 `alwaysIncluded: ["bootstrap"]` 收集。用于实际大功能时，应按该游戏的资源布局放入功能包，并更新 route URL。

## 复用预制体

- [ActionButton.lh](../assets/bootstrap/game/ui/examples/ActionButton.lh)：原生 `GButton`、标题绑定和相对尺寸。
- [PanelChrome.lh](../assets/bootstrap/game/ui/examples/PanelChrome.lh)：标题、关闭按钮与底板。全屏页的顶部标题区和确认弹窗引用同一个 Prefab，尺寸变化由 Relation 处理。
- [InventoryItem.lh](../assets/bootstrap/game/ui/examples/InventoryItem.lh)：Radio 模式 `GButton`，由原生 `button` Controller 和 `GearDisplay` 展示选中边框。
- [Inventory.lh](../assets/bootstrap/game/ui/examples/Inventory.lh)：完整声明 `full + safeContent(top / full / mid / bottom)`，mid 留空；标题和汇总归 top，虚拟列表归 safeContent/full，选择信息和操作按钮归 bottom。列表随上下区域和安全区拉伸，行高与字号不变；源资产声明 Scroller、模板节点及宽高 Relation。
- [Confirmation.lh](../assets/bootstrap/game/ui/examples/Confirmation.lh)：根尺寸 `720×1280` 随屏幕拉伸，safeContent/mid 为 `560×390` 内容画布，对应 `center-popup`；frame、文字和按钮全部归入 mid，只有 mid 做开合动画。
- [FullscreenMid.lh](../assets/bootstrap/game/ui/examples/FullscreenMid.lh)：全屏居中面板，top/bottom 放说明，full 留空，mid 复用 PanelChrome 并提供计数交互。

所有窗口固定 Root/full、safeContent(top/full/mid/bottom)，未使用的节点留空。PanelChrome 提供底板、标题和关闭按钮，分别在 Inventory/top、FullscreenMid/mid、Confirmation/mid 复用；窗口显式绑定其嵌套 closeButton。固定节点始终来自 `.lh`。底部按钮通过 Relation 在侧边安全区收窄时保持间距。

## 类型与生命周期

`.lh` 的 `_$runtime` 指向 Runtime 脚本 `.meta`；需要访问的节点设置 `_$var: true`，名称与 Runtime 的字段一致，例如 `itemList: Laya.GList`。窗口构造时检查实际 Runtime 类型，随后直接访问 `view.itemList`。这些示例使用显式 TS 字段声明，没有新增代码生成器；IDE 的 Runtime + `.generated.ts` 继承方式也可用于同样的视图分工，业务逻辑继续留在 Window。

虚拟列表设置 `itemRenderer` 后调用 `setVirtual()`，数据量通过 `numItems` 驱动；更新用 `refreshVirtualList()`。物品 ID 与显示节点分开，渲染时覆盖全部动态状态，不为每一行重复监听点击，也不对虚拟列表手动增删子节点。

点击事件属于每次 `presentation`，关闭时解绑。异步打开确认窗口传入当前 `BindingToken.signal`，确认回写经 `token.commit()`；父窗口关闭也会取消未完成请求、关闭已显示的确认窗口。取消、重复点击和旧窗口回调均不会重复扣减数量。销毁后由原生 `GList` 清空自己的池，不逐条 `clearRes()`。

`BaseGameWindow` 显式启用窗口外壳输入，使动画前后的布尔状态可恢复；业务随后主动设置 `mouseEnabled = false` 仍会被保留。这避免 Laya 原生 auto 状态读为 `false`，在动画结束后被误写为显式禁用。

## 验证

```sh
npm run typecheck
npm test -- tests/game/logic/ExampleInventory.test.ts tests/framework/UILayoutService.test.ts tests/framework/UIRouter.test.ts tests/framework/BaseGameWindowTransition.test.ts tests/workflow/BrowserProbePlan.test.ts
npm run check:architecture
npm run validate:assets:laya
npm run validate:resource-layout
npm run test:headless -- --suite targeted --probe tests/game/logic/ui-examples.browser.mjs
node tests/game/logic/ui-examples-resolutions.mjs
```

专项探针通过浏览器鼠标事件验证启动入口、虚拟列表选择、确认/取消、模态阻挡、重复确认、父窗口关闭、8 次重开及立即取消打开。全屏 mid 示例在同一实例上切换安全区，验证居中、缩小恢复、按钮点击、返回与重开。扫描和运行时同时检查完整节点顺序，保留错误、404 和完整 owner 停机检查。

分辨率矩阵复用上述构建，最多同时运行 2 个 Headless 浏览器，覆盖 `320×568`、`360×640`、`375×667`、`390×844`、`412×915`、`600×800`、`768×1024`、`1280×720`。每个视口均切换普通、刘海/胶囊、侧边安全区和恢复场景，断言槽位归属、背景覆盖、列表上下拉伸、固定行高/字号、底部定位、无重叠/越界，以及重排后的选择、弹窗和重置点击。项目 `screenMode: vertical` 会按引擎规则旋转横向浏览器视口；这验证的是本项目竖屏适配。

单个尺寸可复查：`node tools/test-browser.mjs --suite targeted --probe tests/game/logic/ui-examples.browser.mjs --viewport 390x844`。`--viewport` 设置真实浏览器 CSS 视口；平台刘海和胶囊数据由探针模拟，结束后恢复。

同一构建输入未变时，后续 UI 框架回归可复用发布目录：`npm run test:browser -- --suite framework`。Windows Headless Chromium / SwiftShader 的结果不代表 macOS、小游戏真机或目标 GPU 的性能验收。

模板选择与独立功能资产见 [UI 模板索引](ui-templates.md)；通用 Mask 配置和关闭后钩子见 [布局约定](ui-layout.md)。
