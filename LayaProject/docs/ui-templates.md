# UI 模板索引

先判定全屏或弹窗，再组合功能与视觉组件。功能名称不能决定窗口类型；示意图和上下文无法确定时先问用户。模板骨架和源码布局共同遵循 [UI 布局约定](ui-layout.md)。

## 窗口骨架

| 模板 | 路径 | 结构与用途 |
| --- | --- | --- |
| Fullscreen | [Fullscreen.lh](../assets/bootstrap/framework/ui/templates/Fullscreen.lh) | 固定 full + safeContent(top/full/mid/bottom)，顺序不变，不用的槽位留空。拉伸内容放 full，固定居中内容放 mid。route.layout = fullscreen。 |
| Popup | [Popup.lh](../assets/bootstrap/framework/ui/templates/Popup.lh) | 与全屏相同的完整骨架；mid 默认 560×390。面板内容全部放 mid，其余槽位留空保留。route.layout = center-popup；框架只动画 mid。 |

```text
Root（所有窗口共用）
├─ full（背景或自定义全屏按钮）
└─ safeContent（平台安全区）
   ├─ top（空槽位高度 0）
   ├─ full（上下栏之间的拉伸内容）
   ├─ mid（固定居中内容／弹窗动画）
   └─ bottom（空槽位高度 0）
```

所有窗口和窗口模板都保留以上节点与顺序；不用就留空，空 top/bottom 高度为 0，空容器通过 mouseThrough 避免遮挡点击。填入内容时设置所需设计尺寸与 Relation。骨架不绑定业务脚本或创建业务路由；复制到当前游戏后分配新 UUID 并设置 Runtime。Popup 默认 modal:true、closeOnMaskClick:true；细节见 [Mask 与关闭后处理](ui-layout.md#通用-mask-与关闭后处理)。

## 功能模板

| 模板 | 路径 | 配置 |
| --- | --- | --- |
| 纵向虚拟列表 | [VirtualList.lh](../assets/bootstrap/framework/ui/templates/VirtualList.lh) | GList、单列、纵向 Scroller、行模板、单选；宽度跟随视区 |
| 物品网格 | [VirtualGrid.lh](../assets/bootstrap/framework/ui/templates/VirtualGrid.lh) | GList、FlowX、默认三列、纵向 Scroller、行列间距与单选；列数可调整 |
| 默认列表项 | [ListItem.lh](../assets/bootstrap/framework/ui/templates/ListItem.lh) | 原生 GButton，Radio 选择模式、标题、选中边框；不含业务 Runtime |

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
list.on(Laya.UIEvent.ClickItem, this, select);
this.presentation.defer(() => list.off(Laya.UIEvent.ClickItem, this, select));
// 更新数据后 list.refreshVirtualList()；关闭由原生 GList 清理自己的池。
```

空数据、选中物品消失以及耗尽等业务状态由窗口处理；上述片段是绑定用法，不包含背包业务规则。

## 视觉组件和组合示例

- [ActionButton.lh](../assets/bootstrap/game/ui/examples/ActionButton.lh)：按钮样式组件。
- [PanelChrome.lh](../assets/bootstrap/game/ui/examples/PanelChrome.lh)：底板、标题和关闭按钮的装饰组件，不是窗口骨架。
- [InventoryItem.lh](../assets/bootstrap/game/ui/examples/InventoryItem.lh)：带数量和稳定 ID 的业务行示例。
- [Inventory.lh](../assets/bootstrap/game/ui/examples/Inventory.lh)：已明确选择全屏的组合示例，top 标题、safeContent/full 自适应列表、bottom 操作区。
- [Confirmation.lh](../assets/bootstrap/game/ui/examples/Confirmation.lh)：弹窗组合示例，全屏 Root 下的 safeContent/mid 包含全部控件。
- [FullscreenMid.lh](../assets/bootstrap/game/ui/examples/FullscreenMid.lh)：全屏 mid 示例，中央面板复用 PanelChrome。由背包中的“全屏 mid 示例”按钮打开，展示居中、缩小恢复与按钮交互。

主界面 = 全屏骨架 + 资源栏/内容/导航 + 散图；弹窗背包 = 弹窗骨架 + 物品网格 + 详情/操作 + 散图。标题栏、按钮或行组件不需要重复增加 full/mid。

## 可重复验收

`npm test -- tests/framework/UIWindowTemplates.test.ts` 检查骨架与功能模板声明，`npm run validate:assets:laya` 使用官方解析器。

`npm run test:headless -- --suite framework --probe tests/game/logic/ui-templates.browser.mjs` 构建并验证模板组合、mid 动画和虚拟列表/网格。构建不变时，可运行 `node tests/game/logic/ui-examples-resolutions.mjs` 复用发布目录进行八分辨率验收。

[RewardProbe.lh](../assets/bootstrap/game/ui/template-probe/RewardProbe.lh) 是独立执行验证生成的组合资产，不注册日常业务路由。探针为它绑定 100 项虚拟网格及取消按钮，并验证关闭后池回收；源资产的 100 项初始内容便于编辑器预览，运行时仍须调用 setVirtual()。

2026-09-10 固定骨架验证：扫描全部 8 个窗口及窗口模板，节点完整且顺序一致。typecheck、67 项相关单测、架构/资源布局检查和 16 个层级资产的官方解析通过；Skill 静态检查、5 个路由案例和独立制作 FullscreenMid 的执行检查通过。LayaAir 3.4.1 原地构建、100 次 UI/Pool 循环、8 种浏览器分辨率 × 4 组安全区均通过。背包列表实例化 6–13 个显示项，行高始终为 88、标题字号为 22；通用列表和三列网格随 full 视口分别实例化 11–18、21–36 个显示项。全屏 mid 在同一实例上居中、缩小并恢复，空槽位不阻挡原生点击。覆盖 Mask 堆叠/关闭开关、弹窗 mid 动画、关闭钩子、池回收及动画期间 resize，无 404、运行时错误或停机 owner 残留。

另通过 CDP 连续切换实际 CSS 视口 390×844 → 600×800 → 320×568 → 390×844，验证同一全屏 mid 窗口的布局与按钮点击，并检查背包、中央面板和弹窗截图。以上为 Windows Headless Chromium / SwiftShader 结果；刘海与胶囊数据为模拟输入，未代替小游戏真机、macOS 或目标 GPU 验收。
