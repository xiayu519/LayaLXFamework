# UI 原生化改造与手动复测

> 本文保留 2026-09-10 前一阶段的历史实现与验收基线，其中场景弹窗宿主和红点数字不代表后续改造。现行归属见 [UI 布局约定](ui-layout.md)，共享库存及总量红点见 [数据绑定](ui-data-binding.md)。以下原始记录不回填新结果。

本轮改动保留在工作区，未执行 commit 或 push。原有 UILobby.lh 修改已保留。

## 改动摘要

| 范围 | 当前行为 |
| --- | --- |
| 启动 | AppEntry.ts 导出原生 async main，CompilerSettings.mainScript 指向它；lx.stop() 显式停止应用，Startup 场景销毁不再停止应用 |
| 场景 UI | BaseGameScene.ui 按需创建上下文；全屏页面直接使用原生 Runtime GWidget，显示于场景 uiRoot |
| 弹窗 | 继续使用原生 GWindow/GRoot、模态遮罩及 mid 动画，但实例、隐藏缓存和待打开请求归所属场景 |
| 页面覆盖 | 同一 Screen 层的新页面暂停下层原生组件；关闭后恢复原实例及状态，HUD 独立 |
| 节点绑定 | 6 个 Runtime 使用 IDE 自动生成的 24 个节点字段；删除窗口 requireChild 辅助方法，生成文件不手改 |
| 红点 | lx.ui.redDots 使用原生 EventDispatcher，按路径增量汇总；RedDotBinding 使用原生 Script/@property，自动订阅、刷新和解绑 |
| 清理 | 离场销毁可见及隐藏 UI，取消旧异步回写；等待原生加载收尾后回收。晚到清理失败保留诊断并阻止不安全的 GC |
| 工具/规则 | 新增 npm run ui:generate，调用官方 IDE 生成流程；更新模板/Skill/分发入口契约，兼容原生 scriptPath 解析 |

所有窗口仍遵守完整骨架，空槽位保留：

```text
Root
├─ full
└─ safeContent
   ├─ top
   ├─ full
   ├─ mid
   └─ bottom
```

背景在 Root/full；背包列表在 safeContent/full；弹窗内容及动画在 mid。两个 full 不导出为同一 Runtime 的同名字段。

## 建议手动复测顺序

在 LayaAir 3.4.1 IDE 选择**启动场景预览**，或使用 `npm run preview`。原生 main 只在启动入口预览/发布时生效；直接预览任意“当前场景”不会自动执行应用启动。

| 操作 | 预期 |
| --- | --- |
| 启动项目 | 显示 READY；“打开 UI 示例”按钮显示红点数量 3；控制台无错误 |
| 打开旅行背包并滚动 | 100 种物品、共 300 件；列表拉伸填满上下栏之间，滚动和选择正常 |
| 点击使用物品，然后取消或点击遮罩 | 只有 mid 做缩放动画；取消不扣数量，遮罩关闭最上层弹窗 |
| 确认使用一次，尝试快速重复点击 | 总量从 300 变 299，选中项从 3 变 2，不重复扣减；返回入口后红点显示 2 |
| 重置背包 | 数据恢复，选中第一项，红点恢复 3 |
| 打开“全屏 mid 示例” | 全屏中间面板可计数、关闭；无弹窗缩放动画，背包实例保留 |
| 调整预览尺寸 | 背景覆盖屏幕、顶部/底部贴正确区域；列表行高与字号不随视口整体缩放；按钮仍可点击 |
| 打开背包和确认弹窗后切换场景 | 旧页面/弹窗全部消失，新场景正常显示；无旧回调、残留遮罩或控制台错误 |

浏览器控制台可直接验证红点：

```js
lx.ui.redDots.set("examples/inventory", 0); // 入口红点隐藏
lx.ui.redDots.set("examples/inventory", 5); // 入口红点显示 5
lx.ui.redDots.setMany({ "examples/inventory": 2, "examples/reward": 1 });
lx.ui.redDots.get("examples"); // 3，子路径自动汇总
```

以下复查命令已更新为当前 API，表格和后面的数字仍为历史基线：

```js
await lx.scenes.open("examples.lobby", {
    status: "READY", detail: "手动复测场景切换"
});
lx.ui.snapshot().scenes.length; // 1
await lx.stop();
lx.ready; // false
await window.$_main_(); // 官方发布入口，重新启动
lx.ready; // true
```

命名游戏调用页面使用 `this.ui.show(route, args)`；在示例浏览器控制台可用 `lx.scenes.get("examples.lobby").ui.show("lx.examples.inventory", { title: "旅行背包" })`。跨场景系统窗口才直接调用 lx.ui.show。

## 自动验证证据

- 最终单测：37 个文件、326 项通过；typecheck 与架构检查通过。
- 17 个层级资产、129 个 UUID 通过静态检查及 LayaAir 3.4.1 官方解析；6 个 Runtime 使用官方生成器生成并复查。
- 原地 Web 构建通过；完整浏览器探针覆盖原生启动/停止、资源、网络、100 次窗口与对象池循环，专项探针覆盖绑定、红点、遮罩、动画、隐藏缓存和 12 次场景切换。
- 8 个浏览器尺寸全部通过：320×568、360×640、375×667、390×844、412×915、600×800、768×1024、1280×720。每个尺寸均检查普通、模拟刘海/胶囊、侧边安全区及恢复；另单独通过 1024×768。
- 独立工作流探针在 390×844 通过：17 次真实鼠标操作、原生引用及骨架检查、红点更新、虚拟行复用、隐藏复用与旧 session 失效、切场景后继续使用。临时探针和报告保留在 local/ui-workflow-forward/，不进入框架源文件。
- 验证过程中有一次组合探针达到 30 秒超时；增加分阶段超时诊断后，同一发布构建的完整组合复验通过，未放宽总超时门槛。

复查命令（构建输入未变时可复用 release/web）：

```sh
node tools/test-browser.mjs --probe tests/game/logic/ui-framework.browser.mjs
node tests/game/logic/ui-examples-resolutions.mjs
```

当前证据来自 Windows Headless Chromium/SwiftShader。项目保持竖屏模式，横向浏览器按引擎规则旋转；模拟安全区不等于小游戏真机，未验证 macOS、小游戏真机及真实 GPU 性能。

更多用法见 [UI 示例](ui-examples.md)、[红点系统](ui-red-dots.md)、[布局规范](ui-layout.md)及[场景流程](scene-flow.md)。
