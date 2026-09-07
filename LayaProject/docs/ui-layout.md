# UI 屏幕与安全区适配

框架不规定项目设计分辨率。每个下游项目在自己的 `settings/PlayerSettings.json` 中维护 `resolution.designWidth`、`resolution.designHeight` 和方向；`720×1280`、`750×1334` 或其他尺寸都可以作为该项目的设计画布。竖屏商业小游戏默认使用 LayaAir 推荐的 `fixedwidth`：项目设计宽度用于等比缩放，运行时 Stage 高度由当前窗口比例决定。若某个项目明确需要不同的可视区域策略，再由该项目调整 `scaleMode`，不写入框架公共契约。

所有 UI 的最终布局边界取运行时 `GRoot.inst.width/height`，也就是 Laya 适配完成后的 Stage 逻辑尺寸，而不是某一套预制体设计坐标或设备物理像素。平台安全区和微信胶囊坐标也会换算到这套运行时逻辑坐标中。

## 常驻根与平台边界

`GRoot.inst` 是唯一常驻显示根，仍由 ui2 管理 `GWindow`、modal 和显示顺序，不建立与其竞争的第二套根节点。`UILayoutService` 随 runtime 启停，监听 Stage resize，并从 `PlatformService.viewport` 读取平台窗口、安全区和顶部宿主占用区域。

默认平台选择规则：存在微信小游戏 `wx` API 时使用 `WeChatMiniGamePlatformService`，否则使用 `WebPlatformService`。微信实现优先读取 `wx.getWindowInfo()`，并通过 `wx.getMenuButtonBoundingClientRect()` 取得右上角胶囊；Web 实现读取 CSS `env(safe-area-inset-*)`。平台返回的是宿主窗口坐标，布局服务统一换算为 Laya Stage 逻辑坐标。

## 全屏 `.lh` 约定

固定节点仍在 `.lh` 中声明。全屏界面可以按需要提供以下约定节点：

```text
Root
├─ fullBleed
└─ safeContent
   ├─ top
   ├─ middle
   └─ bottom
```

- `fullBleed`：铺满当前 GRoot，适合背景、遮罩和边缘特效。
- `safeContent`：铺满平台安全区，交互内容放在这里。
- `top`：保持自身设计高度、横向铺满，并移动到刘海和微信胶囊下方。
- `middle`：保持自身设计尺寸，在安全区内居中；超过安全区时会收缩到安全区边界。
- `bottom`：保持自身设计高度、横向铺满，并贴安全区底部。

不需要的槽位可以省略。槽位内部的按钮、文本和列表继续使用 ui2 的 Relation 系统相对槽位布局，不需要读取平台 API，也不需要逐控件计算刘海偏移。

全屏背景和安全内容必须分开：背景可以延伸到异形屏边缘，文字和可点击控件进入安全区。微信胶囊只改变 `top` 的起点，不会把 `middle` 和 `bottom` 一起下移。

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
- `center-popup`：保留预制体设计尺寸并在避开平台顶部占用后的安全区居中；Popup 层未声明时默认使用该策略。框架自动为该布局播放 `0.3 -> 1` 的 200ms 弹出动画和对应收起动画，`fullscreen`、`safe-screen` 不播放窗口动画。

特殊界面可以读取 `LX.UI.layout.snapshot()` 获得 `viewport`、`safeArea` 和 `topSafeArea`，但一般业务 UI 只需遵循 `.lh` 槽位约定。弹窗动画由 `BaseGameWindow` 通过原生 `GWindow.doShowAnimation()` / `doHideAnimation()` 扩展点统一处理，目标是弹窗 `contentPane`，不会缩放全屏 modal 遮罩。动画期间窗口输入会被禁用；关闭、销毁、重复关闭以及关闭尚未完成时再次显示，都会使旧 Tween 和晚到回调失效。`retention: "destroy"` 在收起动画完成后直接安全销毁，`retention: "hide"` 则恢复原始变换并保留实例。

## 当前公共界面

`SceneLoading.lh` 和 `FrameworkStatus.lh` 已使用 `fullBleed + safeContent + middle`：背景始终覆盖当前 GRoot，中间卡片始终在当前安全区居中，不把资源创作画布中的固定 `x/y` 当作运行时布局。
