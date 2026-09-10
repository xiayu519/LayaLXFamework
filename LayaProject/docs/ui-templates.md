# UI 模板索引

先分别确定 owner、host 和全屏/弹窗布局，再组合功能与视觉组件。场景页面与弹窗都使用 uiRoot 下的原生 GWidget Runtime；应用 lx.ui 的 GWindow 使用 GRoot。功能名称不能决定布局类型；示意图和上下文无法确定时先问用户。模板骨架与归属规则见 [UI 布局约定](ui-layout.md)。

## 目录与命名

UI Prefab 的文件名、根节点名和对应 Runtime 类名统一使用 `UI` 前缀。启动界面资产全部由游戏维护，不再按 framework/game 分目录；可复制的骨架、功能模板、组件与可运行页面归到示例目录：

```text
assets/bootstrap/ui/
├─ UISceneLoading.lh
├─ UITip.lh
└─ examples/
   ├─ UILobby.lh
   ├─ UIInventory.lh
   ├─ UIConfirmation.lh
   ├─ UIFullscreenMid.lh
   ├─ UIBattle.lh
   ├─ components/  UIActionButton、UIPanelChrome、UIInventoryItem、UIDynamicImage
   ├─ templates/   UIFullscreen、UIPopup、UIVirtualList、UIVirtualGrid、UIListItem
   └─ icons/       示例散图和图集
```

模板提供无业务绑定的可复制起点，页面示例展示完整交互。重复的临时奖励测试资产已删除，不再单独保留 `template-probe`。`UIDynamicImage` 的通用 Runtime 修复仍在框架代码中，供游戏 UI 复用；其示例 Prefab 归 examples/components。UIRouter、TipQueue 等服务按职责命名，不套用界面资产命名规则。

## 窗口骨架

| 模板 | 路径 | 结构与用途 |
| --- | --- | --- |
| Fullscreen | [UIFullscreen.lh](../assets/bootstrap/ui/examples/templates/UIFullscreen.lh) | 固定 full + safeContent(top/full/mid/bottom)，顺序不变，不用的槽位留空。拉伸内容放 full，固定居中内容放 mid。UIViewLifecycle.layout = fullscreen。 |
| Popup | [UIPopup.lh](../assets/bootstrap/ui/examples/templates/UIPopup.lh) | 与全屏相同的完整骨架；mid 默认 560×390。面板内容全部放 mid，其余槽位留空保留。UIViewLifecycle.layout = center-popup；框架只动画 mid。 |

```text
Root（所有窗口共用）
├─ full（背景或自定义全屏按钮）
└─ safeContent（平台安全区）
   ├─ top（空槽位高度 0）
   ├─ full（上下栏之间的拉伸内容）
   ├─ mid（固定居中内容／弹窗动画）
   └─ bottom（空槽位高度 0）
```

所有窗口和窗口模板都保留以上节点与顺序；不用就留空，空 top/bottom 高度为 0，空容器通过 mouseThrough 避免遮挡点击。填入内容时设置所需设计尺寸与 Relation。骨架已静态挂载 UIViewLifecycle，不绑定业务脚本或创建业务路由；复制到当前游戏后分配新 UUID 并设置 Runtime，保留并启用生命周期组件，在 IDE 配置 layer/navigation/modal/retention 等参数；注册只提供 id/url 和可选 bind。Popup 默认 modal:true、closeOnMaskClick:true；细节见 [Mask 与关闭后处理](ui-layout.md#通用-mask-与关闭后处理)。

## 功能模板

| 模板 | 路径 | 配置 |
| --- | --- | --- |
| 纵向虚拟列表 | [UIVirtualList.lh](../assets/bootstrap/ui/examples/templates/UIVirtualList.lh) | GList、单列、纵向 Scroller、行模板、单选；宽度跟随视区 |
| 物品网格 | [UIVirtualGrid.lh](../assets/bootstrap/ui/examples/templates/UIVirtualGrid.lh) | GList、FlowX、默认三列、纵向 Scroller、行列间距与单选；列数可调整 |
| 默认列表项 | [UIListItem.lh](../assets/bootstrap/ui/examples/templates/UIListItem.lh) | 原生 GButton，Radio 选择模式、标题、选中边框；不含业务 Runtime |

全屏列表选择 safeContent/full，并通过宽高 Relation 填充 top 与 bottom 间的剩余空间，保持行高、字号及 scale=1。弹窗列表归 safeContent/mid；固定尺寸居中内容才选 mid。Root/full 保持全屏背景职责。

将功能模板引用或规范复制到窗口的内容区，按需求替换行模板的图标、文字和 Runtime。资产已声明 Scroller 和 itemTemplate，运行时绑定原生 API：

```ts
list.itemRenderer = (index, row: Laya.GButton) => {
    const item = items[index];
    row.title = item.name;
    row.grayed = item.disabled;
};
list.setVirtual();
list.numItems = items.length;
const select = () => { selectedId = items[list.selection.index]?.id; };
list.on(Laya.UIEvent.ClickItem, view, select);
session.lifetime.defer(() => list.off(Laya.UIEvent.ClickItem, view, select));
// 更新数据后 list.refreshVirtualList()；关闭由原生 GList 清理自己的池。
```

上述片段位于场景页面或弹窗的 `bind(view,args,session)`；应用 GWindow 使用 presentation 登记清理。空数据、选中物品消失和耗尽状态由业务处理，不属于 GList 模板规则；模型订阅见 [数据绑定](ui-data-binding.md)。

## 视觉组件和组合示例

- [UIDynamicImage.lh](../assets/bootstrap/ui/examples/components/UIDynamicImage.lh)：GLoader Runtime 组件，运行时换图使用 src，适用于嵌套列表图标、按钮 icon、九宫格和图集动画，见 [资源生命周期](ui-resource-lifecycle.md)。

- [UIActionButton.lh](../assets/bootstrap/ui/examples/components/UIActionButton.lh)：按钮样式组件。
- [UIPanelChrome.lh](../assets/bootstrap/ui/examples/components/UIPanelChrome.lh)：底板、标题和关闭按钮的装饰组件，不是窗口骨架。
- [UIInventoryItem.lh](../assets/bootstrap/ui/examples/components/UIInventoryItem.lh)：带数量和稳定 ID 的业务行示例。
- [UIInventory.lh](../assets/bootstrap/ui/examples/UIInventory.lh)：已明确选择全屏的组合示例，top 标题、safeContent/full 自适应列表、bottom 操作区。
- [UIConfirmation.lh](../assets/bootstrap/ui/examples/UIConfirmation.lh)：弹窗组合示例，全屏 Root 下的 safeContent/mid 包含全部控件。
- [UIFullscreenMid.lh](../assets/bootstrap/ui/examples/UIFullscreenMid.lh)：全屏 mid 示例，中央面板复用 PanelChrome。由背包中的“居中展示”按钮打开，展示居中、缩小恢复与按钮交互。

主界面 = 全屏骨架 + 资源栏/内容/导航 + 散图；弹窗背包 = 弹窗骨架 + 物品网格 + 详情/操作 + 散图。标题栏、按钮或行组件不需要重复增加 full/mid。

当前示例的原生 Runtime 保存展示行为，节点字段交给 IDE 生成；可编辑的窗口参数放在根节点静态 UIViewLifecycle 组件。Runtime 新增 @property 不作为 IDE 根节点可保存字段；需要业务可调值时另用静态 Script。路由可注入依赖，无 bind 时默认调用 Runtime.onBind：

| 示例 | 静态 Runtime（包含展示行为） |
| --- | --- |
| UILobby | [UILobby](../src/game/logic/presentation/ui/examples/UILobby.ts) |
| Inventory | [UIInventory](../src/game/logic/presentation/ui/examples/UIInventory.ts) |
| FullscreenMid | [UIFullscreenMid](../src/game/logic/presentation/ui/examples/UIFullscreenMid.ts) |
| Battle | [UIBattle](../src/game/logic/presentation/ui/examples/UIBattle.ts)，由战斗 Scene 拥有 |
| Confirmation | [UIConfirmation](../src/game/logic/presentation/ui/examples/UIConfirmation.ts)，由打开它的展示拥有 |

所有场景示例经 `registerView()` 注册，由 scene.ui 或当前 session 打开；navigation:page 参与覆盖，下层组件通过 active=false 暂停，恢复时重读数据。确认弹窗通过 session.show 归父展示；场景退出销毁全部所属实例、隐藏缓存和待加载。红点与业务计数见 [红点使用](ui-red-dots.md)。

## 可重复验收

`npm test -- tests/framework/UIWindowTemplates.test.ts` 检查骨架与功能模板声明，`npm run validate:assets:laya` 使用官方解析器。

`npm run test:headless -- --suite framework --probe tests/game/logic/ui-templates.browser.mjs` 构建并验证模板组合、mid 动画和虚拟列表/网格。构建不变时，可运行 `node tests/game/logic/ui-examples-resolutions.mjs` 复用发布目录进行八分辨率验收。

列表和网格探针直接使用 examples/templates 下的功能模板，验证 100 项虚拟化、滚动、选择和池回收；窗口关闭使用现有窗口骨架与确认弹窗示例，不再额外维护奖励测试窗口。

2026-09-10 固定骨架验证（原生页面与场景归属改造前的历史基线）：扫描全部 8 个窗口及窗口模板，节点完整且顺序一致。typecheck、67 项相关单测、架构/资源布局检查和 16 个层级资产的官方解析通过；Skill 静态检查、5 个路由案例和独立制作 FullscreenMid 的执行检查通过。LayaAir 3.4.1 原地构建、100 次 UI/Pool 循环、8 种浏览器分辨率 × 4 组安全区均通过。背包列表实例化 6–13 个显示项，行高始终为 88、标题字号为 22；通用列表和三列网格随 full 视口分别实例化 11–18、21–36 个显示项。全屏 mid 在同一实例上居中、缩小并恢复，空槽位不阻挡原生点击。覆盖 Mask 堆叠/关闭开关、弹窗 mid 动画、关闭钩子、池回收及动画期间 resize，无 404、运行时错误或停机 owner 残留。

另通过 CDP 连续切换实际 CSS 视口 390×844 → 600×800 → 320×568 → 390×844，验证同一全屏 mid 窗口的布局与按钮点击，并检查背包、中央面板和弹窗截图。以上为 Windows Headless Chromium / SwiftShader 结果；刘海与胶囊数据为模拟输入，未代替小游戏真机、macOS 或目标 GPU 验收。
