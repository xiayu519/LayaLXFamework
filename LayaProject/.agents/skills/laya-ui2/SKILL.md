---
name: laya-ui2
description: 按示意图制作窗口、选择全屏或弹窗骨架与 GList 功能模板，或修改 LayaAir ui2 分层、动画、场景归属、原生绑定、窗口异步展示生命周期与红点时使用；普通 Scene 与非 UI 资源不触发。
---

# Laya ui2

1. 制作或重组窗口先读 [references/window-workflow.md](references/window-workflow.md)：分别确定 owner、host、layout，再选完整骨架、功能模板、散图与原生节点引用。类型明确不重复询问；无法从上下文确定全屏/弹窗时先询问，不能按“背包/商城”等功能名称猜定。
2. 所有窗口固定完整骨架：Root 的直接子节点依次为 full、safeContent；safeContent 内依次为 top、full、mid、bottom。节点始终保留，不用就留空；空 top/bottom 高度为 0，空容器不拦截输入。Root/full 放背景；全屏拉伸内容放 safeContent/full，固定居中内容放 mid。弹窗全部内容归 mid，只动画 mid。骨架、功能与组件见 [模板索引](../../../docs/ui-templates.md)。
3. 读 [references/lifecycle.md](references/lifecycle.md)。应用 lx.ui 使用原生 GRoot/GWindow；场景 registerView 的所有布局（含 center-popup）使用原生 GWidget Runtime，挂场景 .ls 的 uiRoot。session.show 打开本次展示拥有的子窗口，session.ui.show 打开场景独立窗口。navigation、modal、布局和缓存参数在根节点静态 UIViewLifecycle 组件中分别声明，registerView 只传 id/url 和可选 bind/onClosed；场景遮罩为宿主局部 Sprite，应用复用 GRoot.modalLayer，不创建额外 GRoot。
4. 节点绑定优先 IDE Runtime + `.generated.ts`，少量引用用静态 Script 的 @property，IDE 可调字段也放静态 Script，不能承诺 Runtime 新增 @property 可在根节点保存；不造 Binder；固定节点在 `.lh/.ls` 声明。两个 full 按父级区分，禁止导出到同一 Runtime 的同名字段。生成文件不手改，构造期间不访问尚未反序列化的引用。
5. singleton 按 owner 隔离，可 hide/destroy；multiple 只允许 destroy。父展示关闭或场景离场销毁其全部子 UI，含隐藏缓存和待加载。UIViewSession.lifetime 只覆盖本次展示；异步表现回写使用 token，业务结果先写独立模型，不因 UI 离开丢失。换图使用 UIDynamicImage 组件的 src，保留原生晚到防护；bind 原始 Promise 追踪至结束。
6. 数据刷新用 session.bindData，红点用 session.bindRedDot 或已有 RedDotBinding；BaseGameWindow 提供同名 protected 方法。首次同步读快照，后续原生 callLater 合并，暂停/关闭清理、恢复重读。节点引用与模型订阅分开，见 [数据绑定](../../../docs/ui-data-binding.md)。业务模型、协议入口和红点规则独立于 UI，domain/application 不依赖 Laya。公共提示调用 lx.ui.tip()。
7. 按影响选验证：布局、宿主、安全区或行几何变化才验分辨率；异步/释放改动验证取消与资源，命名/事件不附带适配矩阵。分层变化检查真实骨架，修改 `.lh` 跑 `validate:assets:laya`；真实 ui2 行为按 [Headless 范围](../laya-headless/references/verification.md) 选专项 probe 或 framework 组，复用未受影响的已有证据。
