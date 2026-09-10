# 窗口制作流程

## 判定与选型

- 分别确定 owner、host、layout：应用 lx.ui 的 GWindow 挂 GRoot；场景的页面/HUD/弹窗均通过 registerView 注册原生 GWidget，挂 `.ls` 中 Area2D 外的 uiRoot。父展示拥有的子窗口用 session.show，场景独立窗口用 session.ui.show；全屏/弹窗不决定归属。
- 先看用户明确要求、已有窗口约定和示意图。明确主界面用全屏骨架；明确居中弹窗用弹窗骨架。用户指定优先，功能名称不决定窗口类型。
- 背包、商城等类型仍不明确时，只问“这个界面做成弹窗还是全屏？”。等待期间可清点素材、梳理列表数据与交互，不制作依赖该答案的骨架。已经确认则直接执行。
- 声明本次内容归属，例如“全屏骨架，Root/full 背景、top 资源栏、safeContent/full 列表、bottom 操作”；这不是审批步骤。窗口节点始终完整保留，未使用的槽位留空。按钮、列表项、窗框和 Tip 属于组件，按各自职责组合。
- 从 [模板索引](../../../../docs/ui-templates.md) 查真实路径；窗口骨架、列表/网格和视觉组件职责不能互相替代。模板缺失应补最小可用资产并验证，不把手写成品称作已复用模板。

## 拼装与绑定

- 功能选型同时判断是否需要拉伸。全屏列表放 safeContent/full，填满 top 下沿至 bottom 上沿，宽度跟随安全区；改变列表视口，保留行高、字号和 scale=1，不能整体缩放列表适配短屏。固定尺寸居中内容才用 mid。弹窗列表仍属于动画 mid，在 mid 内用 Relation 拉伸。
- Root/full 覆盖屏幕背景，safeContent/full 填充安全区内上下栏之间的剩余空间，同名节点靠父级确定职责。两个 full 不能导出为同一 Runtime 的同名字段；需要引用时使用 backgroundFull/contentFull 原生属性引用或独立 Runtime 作用域。full 与 mid 都保留。宽高关联使用原生 RelationType.Size；源资产分别声明 Width=1、Height=2，不猜枚举值。
- 全屏与弹窗的节点及顺序完全相同：Root 下 full、safeContent；safeContent 下 top、full、mid、bottom。全部在 .lh 声明，不裁剪、不由运行时补建。空 top/bottom 高度为 0，空容器使用 mouseThrough 避免拦截输入；填入内容时设置所需设计高度与关系。safeContent 适配安全区，top 避开胶囊，bottom 贴安全区底部。弹窗全部面板内容放 mid，并在避开胶囊的安全区域内居中；全屏 mid 保持安全区中心并避让上下区域。
- 场景使用 uiRoot 内的局部 Sprite 遮罩，应用复用 GRoot.modalLayer，均放在最高模态窗口正下方。center-popup 默认 modal: true、closeOnMaskClick: true；禁用点击关闭只设置后者为 false。modal: false 可由 full 内全屏按钮自定义关闭，但不能移除其他窗口的遮罩。透明 Root/safeContent 穿透到 Mask，mid 内点击不触发 Mask；不要重复叠加暗色背景，也不为每个场景创建 GRoot。
- 先选骨架，再按数据形态选纵向列表或网格。模板复制到当前业务资产目录时生成新 UUID，保留本资产内部引用；引用视觉 Prefab 时复用其 UUID，不复制脚本注册 ID 或业务 route ID。
- 按示意图使用已有散图拼装独立节点，分别处理底板、图标、文字和按钮；清点缺少的素材及来源。固定内容保留在 .lh，尺寸关系用原生 Relation，安全区换算交给布局服务。
- GList 的 itemRenderer 完整刷新复用状态，先 setVirtual 再设置 numItems；模板含 Scroller 和 itemTemplate。按稳定业务 ID 更新数据，不保存某个显示行作为长期数据身份。
- 节点引用优先 Runtime + IDE 生成字段，少量引用用 @property；生成文件不手改，不额外建立 Binder。构造期间不能访问尚未反序列化的引用；Native Runtime 可继承符合该根节点类型的业务基类，不为使用生成代码强行增加转发层。
- 场景所有布局注册 UIViewRoute，bind(view,args,session) 直接使用原生字段；navigation:page/overlay 决定是否覆盖页面，modal 决定输入遮挡。展示事件归 session.lifetime，关闭调用 session.close()；子窗口用 session.show，独立场景窗口用 session.ui.show。应用窗口保留 BaseGameWindow 的 presentation/onClosed；嵌套 frame.closeButton 需显式绑定。
- 模型和服务器 snapshot/patch 入口独立于 UI，数据先落模型再发原生事件。session.bindData 读快照并合并表现刷新；session.bindRedDot 或 RedDotBinding 展示业务计数，列表复用先解除旧身份。原生引用与模型订阅分开，详见 [数据绑定](../../../../docs/ui-data-binding.md)。异步业务结果不依赖 UI token，只有表现回写检查 token；换图组件引用 DynamicImage.lh 并使用 src，动态行换身份先解除旧订阅，异步 URL 查询也检查身份/token。图集、图片、Prefab 在 bind 中 await/return，关闭取消展示但继续追踪底层加载。

关闭使用 session.close()、所属 scene.ui 或显式绑定的 closeButton；应用窗口才使用 lx.ui.close。场景 UIViewRoute.onClosed(view,args) 与应用 BaseGameWindow.onClosed() 处理实际展示关闭后的业务；节点可能已销毁，钩子不替代框架清理。父展示关闭销毁其子 UI，场景离场销毁所有所属 UI，均包含 retention:hide 缓存和待完成加载；singleton 按 owner 隔离，multiple 只允许 destroy。

## 验收

以下是各风险的验收要求，按本次实际影响选择。只有布局/宿主矩形、安全区换算、行几何或可改变尺寸的资源发生变化时才做对应分辨率测试。纯命名、事件订阅、取消与资源释放用相关类型/依赖/生命周期探针，不能把窗口制作的整套矩阵作为所有 UI 修改的固定收尾；布局输入未变时保留其已有通过证据。

- 根据用户需求先列期望结构，再扫描项目全部窗口 .lh，检查节点完整性与精确顺序、内容归属、引用和脚本绑定；禁止从已写实现反推验收要求。示例必须同时覆盖全屏 full 拉伸、全屏 mid 居中和弹窗 mid 动画；装饰窗框不充当窗口示例。
- 验证 Runtime/属性引用真实反序列化、两个 full 无字段冲突、场景内页面和弹窗不受 Camera2D 影响；覆盖应用/场景/父展示归属、跨 owner 单例、父关子关、独立场景弹窗保留、隐藏缓存和待加载清理。数据与红点覆盖首次快照、同帧合并、暂停恢复、列表重绑、界面离开后的业务结果及旧回调失效。
- 动画实际只改变 mid；Root/full 与宿主遮罩尺寸和缩放稳定。覆盖开合、重复关闭、销毁、动画期间 resize 及旧回调失效。
- 用真实鼠标事件验证 Mask 只关闭最上层可交互模态窗口、关闭动画期间重复点击不误关下层、禁用点击关闭、modal:false 自定义关闭与堆叠恢复；关闭后钩子按生命周期执行。
- 多分辨率检查顶部避让、底部定位、mid 居中与缩小恢复；列表验证 full 紧贴上下栏、无多余空隙，行高/字号/scale 不变，视口和可见行数随剩余空间变化。视觉与点击区域均不越界、不覆盖；虚拟列表检查滚动复用、选择更新和池回收。
- 规则验证与实际模板/引擎验证分别报告。Skill 路由命中不等于执行正确；模拟安全区不等于真机验收。
