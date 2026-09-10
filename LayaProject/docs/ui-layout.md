# UI 屏幕与安全区适配

当前模板项目默认使用 `720×1280`。框架不规定下游项目设计分辨率；每个项目在自己的 `settings/PlayerSettings.json` 中维护 `resolution.designWidth`、`resolution.designHeight` 和方向，`720×1280`、`750×1334` 或其他尺寸都可以作为该项目的设计画布。竖屏商业小游戏默认使用 LayaAir 推荐的 `fixedwidth`：项目设计宽度用于等比缩放，运行时 Stage 高度由当前窗口比例决定。若某个项目明确需要不同的可视区域策略，再由该项目调整 `scaleMode`，不写入框架公共契约。

所有屏幕 UI 的最终布局边界取 Laya 适配完成后的 Stage 逻辑尺寸。场景 uiRoot 与原生 GRoot 使用同一屏幕坐标，布局服务同时支持普通 GWidget 和 GWindow；不以某个 Prefab 设计尺寸或设备物理像素作为最终边界。平台安全区和微信胶囊坐标也换算到这套运行时逻辑坐标。

## 常驻根与平台边界

`GRoot.inst` 承载应用 lx.ui 的原生 GWindow，由 ui2 管理 modal 和显示顺序。场景的页面、HUD 和弹窗都挂在 `.ls` 声明的 uiRoot，和 Area2D 并列；不为每个场景创建 GRoot，也不改引擎默认 Root。`UILayoutService` 随 runtime 启停，监听 Stage resize，并从 `PlatformService.viewport` 读取平台窗口、安全区和顶部宿主占用区域；安全区只在界面骨架内应用一次，uiRoot 不重复扣除。

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

- `Root/full`：铺满当前屏幕，适合背景、自定义遮罩和边缘特效。
- `safeContent`：铺满平台安全区，交互内容放在这里。
- `top`：保持自身设计高度、横向铺满，并移动到刘海和微信胶囊下方。
- `safeContent/full`：横向填满安全区，纵向从 top 下沿铺到 bottom 上沿；无 top 时避开胶囊，无 bottom 时到安全区底部。用于全屏滚动列表，通过原生宽高 Relation 让面板和 GList 拉伸，保持 scale=1、行高与字号不变。
- `mid`：用于固定尺寸居中内容，保持设计尺寸和安全区中心；空间不足时整体等比缩小，同时避开 top、bottom。全屏滚动列表应使用 full。
- `bottom`：保持自身设计高度、横向铺满，并贴安全区底部。

空 top/bottom 的高度固定为 0；其他空槽位仍保留，空容器使用 mouseThrough 避免拦截输入。弹窗的空槽位也跟随安全区布局，只有 mid 参与开合动画。槽位内部的按钮、文本和列表使用 ui2 Relation 相对槽位布局，不需要逐控件计算刘海偏移。

两个 full 是固定的不同槽位，不能同时导出为同一 Runtime 的同名字段；需要脚本引用时用 `backgroundFull/contentFull` 原生属性引用，或者由独立 Runtime 管理各自作用域。

全屏背景和安全内容必须分开：背景可以延伸到异形屏边缘，文字和可点击控件进入安全区。微信胶囊只改变 `top` 的起点，不会把 `mid` 和 `bottom` 一起下移。

`mid` 的可用高度按安全区中心到上下槽位边界的较短距离确定。长屏恢复设计尺寸，短屏等比缩小，始终不改变安全区中心。如果上下固定区域已占到中心，中心内容就没有可用空间；此时需降低该界面的固定区域高度或调整项目的屏幕策略，不能靠遮盖内容完成适配。

`.lh` 必须拥有一个用于编辑器排版的设计宽高，但这个数值只属于该资源的创作画布。`fullscreen` 和 `safe-screen` 在显示时由 `UILayoutService` 按运行时 Stage 调整原生页面或窗口 Pane 及槽位；内置界面的创作尺寸不限制下游设计分辨率。

## owner、host、layout

owner 决定谁关闭和回收 UI，host 决定实际父节点，layout 决定骨架适配。全屏或弹窗不决定 owner；场景可以拥有独立弹窗，当前页面也可以拥有子弹窗。

| 打开入口 | owner | host / 原生对象 |
| --- | --- | --- |
| `lx.ui.show()` | 应用 | 原生 GRoot / GWindow |
| `scene.ui.show()`、`session.ui.show()` | 场景 | 场景 uiRoot / GWidget Runtime |
| `session.show()` | 当前 UI 展示 | 继承所在场景 uiRoot / GWidget Runtime |

父展示关闭时，`session.show()` 打开的子 UI 连同隐藏缓存和待加载请求一起销毁；`session.ui.show()` 打开的独立窗口仍归场景。场景离场清理全部所属 UI。singleton 按 owner 隔离，retention:hide 只在 owner 存活期间复用；multiple 只允许 destroy。

## Route 布局策略

```ts
const battleHudRoute: UIViewRoute<BattleHudArgs, BattleHudView> = {
    id: "battle-hud",
    url: "game/ui/BattleHud.lh",
    layer: UILayer.HUD,
    layout: "fullscreen",
    navigation: "overlay",
    retention: "destroy",
    viewType: BattleHudView, // .lh 的原生 Runtime，节点字段由 IDE 生成。
    bind(view, args, session) {
        view.healthText.text = String(args.health);
        view.exitButton.on(Laya.Event.CLICK, view, session.close);
        session.lifetime.defer(() => view.exitButton.offAllCaller(view));
    },
};

const resultRoute: UIViewRoute<ResultArgs, ResultView> = {
    id: "battle-result",
    url: "game/ui/BattleResult.lh",
    layer: UILayer.Popup,
    layout: "center-popup",
    navigation: "overlay",
    modal: true,
    closeOnMaskClick: true,
    multiplicity: "multiple",
    retention: "destroy",
    viewType: ResultView,
    bind(view, args, session) {
        view.closeButton.on(Laya.Event.CLICK, view, session.close);
        session.lifetime.defer(() => view.closeButton.offAllCaller(view));
    },
    onClosed(_view, args) {
        // 只做关闭后的业务处理；节点可能已经销毁。
    },
};
```

- `fullscreen`：原生页面或窗口 Pane 铺满屏幕，并处理上述约定节点。
- `safe-screen`：整个 Pane 限制在避开平台顶部占用后的安全区内，适合不需要满屏背景的工具页。
- `center-popup`：场景 Runtime 根节点或应用窗口 Pane 仍铺满屏幕，safeContent 铺满安全区；只让 mid 保留设计尺寸，在避开平台顶部占用后的安全区居中，空间不足时等比缩小，只有 mid 参与开合动画。UIViewRoute 显式声明布局，不根据 layer 推断适配策略。

`navigation: "page"` 参与页面覆盖和返回恢复，`"overlay"` 保留下面页面；`modal` 单独控制输入遮挡。因此 center-popup 不等于场景外窗口，fullscreen 也不必加入页面栈。UIViewRoute 同时支持 layer、layout、navigation、modal、closeOnMaskClick、multiplicity、retention 和 onClosed。

特殊界面可以读取 `lx.ui.layout.snapshot()` 获得 `viewport`、`safeArea` 和 `topSafeArea`；一般业务只需遵循槽位约定。布局和动画不改变宿主，Root/full/safeContent 与宿主遮罩不参与 mid 缩放。关闭、销毁、重复打开和 resize 需要取消或更新旧 Tween，阻止旧回调修改新展示。应用 GWindow 使用原生动画扩展点；场景 UIViewRoute 由 SceneUI 管理原生 GWidget 的展示。

上例 HUD 与结算弹窗都经 `registerView()` 注册，场景使用 `this.ui.show(route, args)` 打开。属于某个页面的确认框使用 `session.show(resultRoute, args)`；独立结算窗口使用 `session.ui.show(resultRoute, args)`。应用级 GWindow 使用 `register()` 与 `lx.ui.show()`。

公共 `Tip` 使用 `topSafeArea` 定位；当安全区比 Tip 设计尺寸更窄时会整体等比缩小，并按缩放后的显示宽度居中，回池时恢复原始变换。

## 通用 Mask 与关闭后处理

center-popup 默认 modal:true、closeOnMaskClick:true。场景使用宿主 uiRoot 内的局部 Sprite 遮罩，应用复用原生 GRoot.modalLayer；都紧邻最高可见模态窗口下方：全屏、A、Mask、B，关闭 B 后恢复为全屏、Mask、A。场景 Sprite 只承担遮罩绘制和输入拦截，跟随宿主 resize，不需要 Runtime 控件引用。点击只关闭最上层可交互模态窗口，不能越过上方非模态窗口关闭下层；场景 Mask 不迁移到全局 GRoot。

closeOnMaskClick:false 保留遮挡但不允许点空白关闭。modal:false 不为本窗口请求遮罩，可在 full 内放自定义全屏按钮，通过 session.close() 关闭；应用窗口才使用 lx.ui.close，仍保留下层模态窗口的遮罩。Root 和 safeContent 的透明区域透传到 Mask，mid 吸收内部空白点击；full 内自定义按钮需要覆盖整个 full 并设置原生 Size Relation。

场景 route 使用 `onClosed(view, args)`，应用 BaseGameWindow 覆写 protected `onClosed(): void`。每次实际展示关闭后调用一次，hide 缓存重开可再次调用，未展示的取消不调用。先结束展示订阅和旧异步；钩子只做业务后处理，节点可能已销毁，不替代框架清理。模型订阅及奖励晚到处理见 [数据绑定](ui-data-binding.md)。

## 当前公共界面

`SceneLoading.lh` 和 `FrameworkStatus.lh` 使用完整骨架，内容填入 mid，top/full/bottom 留空；背景覆盖屏幕，卡片保持安全区居中。Loading 使用 GRoot，FrameworkStatus 是场景内原生页面。Fullscreen/Popup 模板、Inventory、FullscreenMid、Confirmation 和 RewardProbe 同样保留全部节点。按钮、列表项、PanelChrome 和池化 Tip 是组合组件，按各自职责嵌入或由对应服务呈现。

[旅行背包示例](ui-examples.md) 保留 `safeContent(top / full / mid / bottom)`，mid 留空：顶部标题和汇总、上下拉伸的虚拟列表、底部选择信息和操作按钮。`node tests/game/logic/ui-examples-resolutions.mjs` 在当前构建上检查多种浏览器分辨率及模拟安全区，包含固定行高、字号和重排后的实际鼠标操作。
