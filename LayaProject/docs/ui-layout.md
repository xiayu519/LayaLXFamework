# UI 屏幕与安全区适配

当前模板项目默认使用 `720×1280`。框架不规定下游项目设计分辨率；每个项目在自己的 `settings/PlayerSettings.json` 中维护 `resolution.designWidth`、`resolution.designHeight` 和方向，`720×1280`、`750×1334` 或其他尺寸都可以作为该项目的设计画布。竖屏商业小游戏默认使用 LayaAir 推荐的 `fixedwidth`：项目设计宽度用于等比缩放，运行时 Stage 高度由当前窗口比例决定。若某个项目明确需要不同的可视区域策略，再由该项目调整 `scaleMode`，不写入框架公共契约。

所有 UI 的最终布局边界取运行时 `GRoot.inst.width/height`，也就是 Laya 适配完成后的 Stage 逻辑尺寸，而不是某一套预制体设计坐标或设备物理像素。平台安全区和微信胶囊坐标也会换算到这套运行时逻辑坐标中。

## 常驻根与平台边界

`GRoot.inst` 是唯一常驻显示根，仍由 ui2 管理 `GWindow`、modal 和显示顺序，不建立与其竞争的第二套根节点。`UILayoutService` 随 runtime 启停，监听 Stage resize，并从 `PlatformService.viewport` 读取平台窗口、安全区和顶部宿主占用区域。

默认平台选择规则：存在微信小游戏 `wx` API 时使用 `WeChatMiniGamePlatformService`，否则使用 `WebPlatformService`。微信实现优先读取 `wx.getWindowInfo()`，并通过 `wx.getMenuButtonBoundingClientRect()` 取得右上角胶囊；Web 实现读取 CSS `env(safe-area-inset-*)`。平台返回的是宿主窗口坐标，布局服务统一换算为 Laya Stage 逻辑坐标。

## 所有窗口的 `.lh` 约定

全部窗口在 `.lh` 中固定声明以下完整层级及顺序，未使用的节点留空保留。全屏按适配需求填充 full 或 mid；弹窗全部面板内容放入 mid：

```text
Root
├─ full
└─ safeContent
   ├─ top
   ├─ full（上下栏之间的拉伸内容区）
   ├─ mid
   └─ bottom
```

- `Root/full`：铺满当前 GRoot，适合背景、自定义遮罩和边缘特效。
- `safeContent`：铺满平台安全区，交互内容放在这里。
- `top`：保持自身设计高度、横向铺满，并移动到刘海和微信胶囊下方。
- `safeContent/full`：横向填满安全区，纵向从 top 下沿铺到 bottom 上沿；无 top 时避开胶囊，无 bottom 时到安全区底部。用于全屏滚动列表，通过原生宽高 Relation 让面板和 GList 拉伸，保持 scale=1、行高与字号不变。
- `mid`：用于固定尺寸居中内容，保持设计尺寸和安全区中心；空间不足时整体等比缩小，同时避开 top、bottom。全屏滚动列表应使用 full。
- `bottom`：保持自身设计高度、横向铺满，并贴安全区底部。

空 top/bottom 的高度固定为 0；其他空槽位仍保留，空容器使用 mouseThrough 避免拦截输入。弹窗的空槽位也跟随安全区布局，只有 mid 参与开合动画。槽位内部的按钮、文本和列表使用 ui2 Relation 相对槽位布局，不需要逐控件计算刘海偏移。

全屏背景和安全内容必须分开：背景可以延伸到异形屏边缘，文字和可点击控件进入安全区。微信胶囊只改变 `top` 的起点，不会把 `mid` 和 `bottom` 一起下移。

`mid` 的可用高度按安全区中心到上下槽位边界的较短距离确定。长屏恢复设计尺寸，短屏等比缩小，始终不改变安全区中心。如果上下固定区域已占到中心，中心内容就没有可用空间；此时需降低该界面的固定区域高度或调整项目的屏幕策略，不能靠遮盖内容完成适配。

`.lh` 必须拥有一个用于编辑器排版的设计宽高，但这个数值只属于该资源的创作画布。`fullscreen` 和 `safe-screen` 在显示时会由 `UILayoutService` 按当前项目的运行时 Stage 重新设置 Window、根 Pane 和约定槽位，因此框架内置界面的创作尺寸不会限制下游项目选择自己的设计分辨率。

## Route 布局策略

```ts
const battleHudRoute: UIRoute<BattleHudArgs> = {
    id: "battle-hud",
    url: "game/ui/BattleHud.lh",
    layer: UILayer.HUD,
    layout: "fullscreen",
    multiplicity: "singleton",
    retention: "destroy",
    create: (pane) => new BattleHudWindow(pane),
};

const resultRoute: UIRoute<ResultArgs> = {
    id: "battle-result",
    url: "game/ui/BattleResult.lh",
    layer: UILayer.Popup,
    layout: "center-popup",
    modal: true,
    multiplicity: "multiple",
    retention: "destroy",
    create: (pane) => new ResultWindow(pane),
};
```

- `fullscreen`：Window 和根 Pane 铺满 GRoot，并处理上述约定节点。
- `safe-screen`：整个 Pane 限制在避开平台顶部占用后的安全区内，适合不需要满屏背景的工具页。
- `center-popup`：Window 和根 Pane 仍铺满屏幕，safeContent 铺满安全区；只让 mid 保留设计尺寸，在避开平台顶部占用后的安全区居中，空间不足时等比缩小；Popup 层未声明时默认使用该策略。框架自动为该布局播放 `0.3 -> 1` 的 200ms 弹出动画和对应收起动画，`fullscreen`、`safe-screen` 不播放窗口动画。

特殊界面可以读取 `LX.UI.layout.snapshot()` 获得 `viewport`、`safeArea` 和 `topSafeArea`，但一般业务 UI 只需遵循 `.lh` 槽位约定。弹窗动画由 `BaseGameWindow` 通过原生 `GWindow.doShowAnimation()` / `doHideAnimation()` 扩展点统一处理，目标是弹窗 `safeContent/mid`，Root/full/safeContent 和原生 modal 遮罩不参与动画。resize 会先取消旧 Tween、按新安全区布局，再继续当前开合阶段；恢复尺寸时还原设计缩放。动画期间窗口输入会被禁用；关闭、销毁、重复关闭以及关闭尚未完成时再次显示，都会使旧 Tween 和晚到回调失效。`retention: "destroy"` 在收起动画完成后直接安全销毁，`retention: "hide"` 则恢复原始变换并保留实例。

公共 `Tip` 使用 `topSafeArea` 定位；当安全区比 Tip 设计尺寸更窄时会整体等比缩小，并按缩放后的显示宽度居中，回池时恢复原始变换。

## 通用 Mask 与关闭后处理

center-popup 默认 modal:true、closeOnMaskClick:true。复用原生 GRoot.modalLayer，不新增固定 Mask 层：栈为全屏、A、Mask、B，关闭 B 后恢复为全屏、Mask、A。点击只关闭最上层可交互模态窗口；动画期间忽略重复点击。上方存在非模态窗口时，不会越过它关闭下层窗口。

closeOnMaskClick:false 保留遮挡但不允许点空白关闭。modal:false 不为本窗口请求原生遮罩，可在 full 内放自定义全屏按钮，通过 LX.UI.close 关闭；仍保留下层模态窗口的遮罩。Root 和 safeContent 的透明区域透传到 Mask，mid 吸收内部空白点击；full 内自定义按钮需要覆盖整个 full 并设置原生 Size Relation。

子类通过 protected onClosed(): void {} 扩展关闭后业务处理。钩子在原生隐藏/销毁调用结束后的 microtask 执行，每次实际展示关闭后调用一次；Hide 保留实例再次打开后可再次调用，未展示的取消不调用。presentation、旧异步和 Tween 先失效，再执行钩子；钩子异常会记录日志并允许原生回收继续。钩子只做业务后处理，不访问已关闭节点、不替代 hide/destroy 的清理。

## 当前公共界面

`SceneLoading.lh` 和 `FrameworkStatus.lh` 使用完整骨架，内容填入 mid，top/full/bottom 留空；背景覆盖 GRoot，卡片保持安全区居中。Fullscreen/Popup 模板、Inventory、FullscreenMid、Confirmation 和 RewardProbe 同样保留全部节点。按钮、列表项、PanelChrome 和池化 Tip 是组合组件，按各自职责嵌入或由对应服务呈现。

[旅行背包示例](ui-examples.md) 保留 `safeContent(top / full / mid / bottom)`，mid 留空：顶部标题和汇总、上下拉伸的虚拟列表、底部选择信息和操作按钮。`node tests/game/logic/ui-examples-resolutions.mjs` 在当前构建上检查多种浏览器分辨率及模拟安全区，包含固定行高、字号和重排后的实际鼠标操作。
