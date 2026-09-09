# 可调用 UI 示例

启动模板后点击 **打开 UI 示例**，进入旅行背包。示例包含 100 项虚拟列表、物品选择、确认使用、取消、重置，以及关闭后重新打开。数据仅保存在本次窗口内，不涉及存档、网络或付费。

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

模板注册的 ID 是 `lx.examples.inventory` 和 `lx.examples.confirm`；控制台也可调用 `LX.UI.show("lx.examples.inventory", { title: "旅行背包" })`。

## 示例结构

| 文件 | 职责 |
| --- | --- |
| [registerUIExamples.ts](../src/game/logic/bootstrap/registerUIExamples.ts) | 两条 typed route 的组装与注册 |
| [ExampleInventoryWindow.ts](../src/game/logic/presentation/ui/examples/ExampleInventoryWindow.ts) | 列表绑定、选择刷新、确认窗口的 owner 清理 |
| [ExampleInventoryView.ts](../src/game/logic/presentation/ui/examples/ExampleInventoryView.ts) | 全屏 `.lh` 根 Runtime 的类型化节点 |
| [ExampleItemView.ts](../src/game/logic/presentation/ui/examples/ExampleItemView.ts) | 每次复用时完整刷新物品 ID、文字、数量和灰态 |
| [ExampleConfirmationWindow.ts](../src/game/logic/presentation/ui/examples/ExampleConfirmationWindow.ts) | 确认只执行一次，取消与关闭不执行确认回调 |
| [ExampleInventory.ts](../src/game/logic/presentation/ui/examples/ExampleInventory.ts) | 无引擎依赖的示例数据；按稳定 ID 更新数量 |

资产位于 `assets/bootstrap/game/ui/examples/`，由现有 `alwaysIncluded: ["bootstrap"]` 收集。用于实际大功能时，应按该游戏的资源布局放入功能包，并更新 route URL。

## 复用预制体

- [ActionButton.lh](../assets/bootstrap/game/ui/examples/ActionButton.lh)：原生 `GButton`、标题绑定和相对尺寸。
- [WindowFrame.lh](../assets/bootstrap/game/ui/examples/WindowFrame.lh)：标题、关闭按钮与底板。全屏页和确认弹窗引用同一个 Prefab，尺寸变化由 Relation 处理。
- [InventoryItem.lh](../assets/bootstrap/game/ui/examples/InventoryItem.lh)：Radio 模式 `GButton`，由原生 `button` Controller 和 `GearDisplay` 展示选中边框。
- [Inventory.lh](../assets/bootstrap/game/ui/examples/Inventory.lh)：`fullBleed + safeContent + middle` 布局，列表在源资产声明 Scroller 和模板节点。
- [Confirmation.lh](../assets/bootstrap/game/ui/examples/Confirmation.lh)：根尺寸 `560×390`，对应 `center-popup`；根下名为 `frame` 的窗框供 `GWindow` 自动识别 `closeButton`。

全屏窗框位于安全区 `middle` 内，所以窗口构造时用 `this.closeButton = pane.frame.getChild("closeButton")` 绑定关闭按钮。固定节点始终来自 `.lh`，无需运行时补建。

## 类型与生命周期

`.lh` 的 `_$runtime` 指向 Runtime 脚本 `.meta`；需要访问的节点设置 `_$var: true`，名称与 Runtime 的字段一致，例如 `itemList: Laya.GList`。窗口构造时检查实际 Runtime 类型，随后直接访问 `view.itemList`。这些示例使用显式 TS 字段声明，没有新增代码生成器；IDE 的 Runtime + `.generated.ts` 继承方式也可用于同样的视图分工，业务逻辑继续留在 Window。

虚拟列表设置 `itemRenderer` 后调用 `setVirtual()`，数据量通过 `numItems` 驱动；更新用 `refreshVirtualList()`。物品 ID 与显示节点分开，渲染时覆盖全部动态状态，不为每一行重复监听点击，也不对虚拟列表手动增删子节点。

点击事件属于每次 `presentation`，关闭时解绑。异步打开确认窗口传入当前 `BindingToken.signal`，确认回写经 `token.commit()`；父窗口关闭也会取消未完成请求、关闭已显示的确认窗口。取消、重复点击和旧窗口回调均不会重复扣减数量。销毁后由原生 `GList` 清空自己的池，不逐条 `clearRes()`。

`BaseGameWindow` 显式启用窗口外壳输入，使动画前后的布尔状态可恢复；业务随后主动设置 `mouseEnabled = false` 仍会被保留。这避免 Laya 原生 auto 状态读为 `false`，在动画结束后被误写为显式禁用。

## 验证

```sh
npm run typecheck
npm test -- tests/game/logic/ExampleInventory.test.ts tests/game/logic/ApplicationComposition.test.ts tests/framework/UIRouter.test.ts tests/framework/BaseGameWindowTransition.test.ts
npm run check:architecture
npm run validate:assets:laya
npm run validate:resource-layout
npm run test:headless -- --suite targeted --probe tests/game/logic/ui-examples.browser.mjs
```

专项探针通过浏览器鼠标事件验证启动入口、虚拟列表选择、选中样式、确认/取消、模态阻挡、重复确认、父窗口关闭、8 次重开及立即取消打开；记录实际显示项数量，并断言窗口销毁后原生列表池为空。它保留现有浏览器运行时错误、404 和完整 owner 停机检查。

同一构建输入未变时，后续 UI 框架回归可复用发布目录：`npm run test:browser -- --suite framework`。Windows Headless Chromium / SwiftShader 的结果不代表 macOS、小游戏真机或目标 GPU 的性能验收。

2026-09-09 本机验证结果：typecheck、39 项相关单测、架构/资源布局检查及 9 个层级资产的官方解析全部通过；真实引擎中 100 项列表实例化 7 个显示项，8 次示例重开与 100 次 UI/Pool 框架循环通过，停机 owner 清理完成，无 404 或运行时错误。另在 `390×844` 浏览器视口检查了启动页、背包和确认弹窗截图。
