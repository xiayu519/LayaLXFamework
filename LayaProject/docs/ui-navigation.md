# UI 层级与打开方式

窗口的归属、显示层级、布局和打开方式分别配置。场景 UI 参数在 Prefab 根节点静态 `UIViewLifecycle` 组件中编辑；注册仍只提供 id/url 和可选 bind/onClosed。内部固定骨架不变，见 [布局约定](ui-layout.md)。

## 显示层级

| IDE 显示 | 枚举 | 当前宿主内的 zOrder 范围 |
| --- | --- | --- |
| 背景层 | Background | 0–999 |
| 页面层 | Screen | 1000–1999 |
| 常驻信息层 | HUD | 2000–2999 |
| 弹窗层 | Popup | 3000–3999 |
| 引导层 | Guide | 4000–4999 |
| 提示层 | Toast | 5000–5999 |
| 系统层 | System | 6000–6999 |

新打开的窗口在自己的层内靠前，实际值为层起点加同层顺序。请求顺序在加载前确定，较早请求晚到不能抢到较晚请求前面。关闭后回收位置，不把持续增长的请求编号直接当 zOrder；每层最多 1000 个挂载窗口，溢出拒绝，不挤进下一层。

`scene.ui.bringToFront(view)` 在原层内置顶，不重新绑定、不重建节点；应用窗口使用原生 `window.bringToFront()`。渲染顺序与原生命中遍历保持一致。框架仅在窗口结构变化时排序，数据事件和普通动画不调用窗口排序。

原生 `zOrder` 作用于同父节点。完整顺序为宿主顺序、宿主内层级、同层窗口顺序；不同 Scene 的 UI 不因一个子窗口数字更大就越过另一宿主。Scene.uiRoot 的位置、大小和根 zOrder 仍由 [场景接口](scene-flow.md) 控制。不要绕过窗口接口修改受管窗口的子节点索引或 zIndex。

普通分层节点和 stackingRoot 都不构成独立渲染通道。当前保留每个 Scene 一个 uiRoot、窗口直接挂载的结构；应用 GWindow 继续直接挂原生 GRoot。层级不承诺合批，性能策略见 [2D 性能](performance.md)。

## 打开方式

| IDE 选项 | openMode | 成功后的行为 |
| --- | --- | --- |
| 关闭下层 | replace | 关闭同一 SceneUI 中较早打开、层级不高于新窗口的全屏展示 |
| 叠加下层 | stack | 保留已有展示及其数据订阅，底层继续运行 |

此属性只对 fullscreen 生效。center-popup 时 IDE 隐藏该项，运行时强制按 stack 处理，不论该弹窗选择了哪个显示层级。独立弹窗不参与全屏替换；旧页面拥有的子窗口仍随旧页面清理，包含隐藏缓存和未完成加载。另一个 Scene 和应用 Loading 不受影响。

新窗口先加载、绑定并检查有效性，成功后才结束下层展示；加载或绑定失败保留旧页面。成功时解除打开请求与来源页面 signal 的连接，再关闭旧页面，避免旧页面关闭取消其继任窗口。较早全屏请求被较晚替换超越后，即使后来才加载完成，也不能再次显示。

关闭意味着结束展示 lifetime、清理订阅、取消旧回写并清理子 UI。retention:destroy 销毁实例；retention:hide 只缓存脱离显示树的实例，重开创建新的展示绑定。关闭新页面不会自动恢复旧页面。旧页清理失败会保留诊断并通过统一日志报告，已准备好的新页继续显示。

替换全屏使用 `scene.ui.show()` 或 `session.ui.show()`。父展示拥有的全屏子 UI 使用 stack；用 session.show 打开 replace 全屏会报错，防止关闭父展示时连同新页面一起销毁。

## 示例流程

- 大厅打开旅行背包：UIInventory 为 replace，UILobby 展示销毁；账号数据和 Scene 保留。
- 背包返回大厅：关闭按钮执行传入的 onBack，重新 `scene.ui.show("lx.status", args)`；大厅准备成功后背包按 hide 缓存。返回失败时背包仍可使用。
- 背包打开“居中展示”：UIFullscreenMid 为 stack，通过 session.show 归背包展示；关闭居中页只移除它，背包继续运行。
- 使用物品确认框：center-popup，通过 session.show 归背包展示，只动画 mid；关闭背包时确认框一并清理。

这些流程演示的是功能各自的生命周期，不把模型或服务器响应绑定到某个 UI。数据规范见 [数据驱动 UI](ui-data-binding.md)。

## 迁移

旧字段 navigation:page/overlay 已替换为 openMode:replace/stack，项目内资产和模板已同步。旧 page 的暂停/自动恢复语义不再保留；下游自有资产应明确选择打开方式，并为 replace 页面编写返回流程。不要只改字段名却继续依赖暂停栈。

相关实现：[UIViewLifecycle](../src/framework/presentation/ui/UIViewLifecycle.ts)、[SceneUI](../src/framework/presentation/ui/SceneUI.ts)、[UILayerOrder](../src/framework/presentation/ui/UILayerOrder.ts)。专项验证：`node tools/test-browser.mjs --suite targeted --probe tests/game/logic/ui-navigation.browser.mjs`，需使用包含当前源代码的构建。
