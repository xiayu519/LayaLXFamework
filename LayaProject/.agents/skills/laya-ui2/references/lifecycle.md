# ui2 Lifecycle

- owner、host、layout 分开：`lx.ui` 的应用窗口由原生 GRoot/GWindow 承载；`BaseGameScene.ui` 的 UIViewRoute 全部使用原生 GWidget Runtime，包括 center-popup，挂 `.ls` 声明的 uiRoot。不为场景创建 GRoot，不改引擎默认 Root。
- Runtime + IDE `.generated.ts` 或静态 Script 的 @property 完成节点引用，不维护第二套绑定器。Prefab.create 完成后才消费引用；同步属性赋值无需 token，跨 await 回写要检查失效。
- 场景窗口根静态 UIViewLifecycle 配置 layout/layer/navigation/modal/closeOnMaskClick/multiplicity/retention；registerView 只保留 id/url 与可选 bind/onClosed。无 bind 时调用静态 Runtime.onBind，不要求导入具体 Runtime 构造类。IDE 可调参数放静态 Script；Runtime 是运行时替代类型，不把其新增属性当作 IDE 可保存字段。
- UIViewRoute.bind / 默认 Runtime.onBind 的 session 提供 ui/token/lifetime/close、show、bindData、bindRedDot。session.show 打开的子窗口归本次展示，父关闭连同隐藏缓存和待加载一起清理；session.ui.show 归场景，父窗口关闭不影响它。旧 session.close 不得关闭新展示。singleton 按 owner 隔离，hide 不延长 owner 寿命；multiple 只允许 destroy。
- navigation:page 参与页面覆盖，overlay 保留下面页面；这与 fullscreen/center-popup、modal 分开。页面暂停使用原生 active=false 并停止数据绑定，恢复原实例时同步重读快照。应用 Loading 不属于场景页面栈。
- World 只登记路由及撤销回调，不持有 UI。unregisterView 立即撤销该定义的新请求，并清理所有场景中该定义的可见、隐藏与待加载实例；过期定义不得注销同 ID 新注册。
- 场景离场取消打开请求并销毁所属可见实例、隐藏缓存和嵌套子窗口；等待原生加载稳定后再 GC。不能只销毁显示树来代替 owner 清理。
- `GWindow.show()` 交给 `GRoot.showWindow()`；Hide 从显示树移除并触发 presentation 清理。
- `GWindow.destroy()` 会先隐藏仍在 `GRoot` 的窗口。observer 在进入原生 destroy 前必须暂时解除，避免 Hide → router Destroy 重入。
- 排序读取真实宿主的节点顺序，布局槽位不参与窗口栈排序。SceneUI.snapshot().views 查询场景实例；应用窗口由 UIRouter 查询。场景遮罩使用宿主局部 Sprite，应用使用 GRoot.modalLayer，都放在最高可见模态窗口正下方；closeOnMaskClick 控制空白点击，不能越过上方窗口关闭下层。
- UIViewRoute.onClosed(view,args) 与 BaseGameWindow.onClosed() 只处理实际展示关闭后的业务；节点可能已销毁，不能替代框架清理或假定仍可读写视图。
- 换图引用 UIDynamicImage.lh 组件（Runtime 继承 GLoader），使用 src 并沿用原生晚到防护；3.4.1 直接换图存在重复引用，不能假设裸 GLoader 的换图生命周期安全。固定图继续原生引用，不建 DynamicTextureBinding。详见 [资源生命周期](../../../../docs/ui-resource-lifecycle.md)。
- bind/onBind 的原始 Promise 必须等待到底层工作结束；关窗立即失效展示，但不取消其他 owner 共用的 Loader。destroy 后等待原生组件销毁帧再 GC。闭包内 fire-and-forget 无法自动跟踪。
- scene.ui 属于显式场景实例；uiRoot 通过原生导出变量或赋值绑定，不按名字查找。setViewport 使用 Stage 逻辑坐标，祖先保持无变换屏幕空间；root.zOrder 可调整，releaseCached 仅清已关闭缓存。
- UI route 的 `.lh` 默认不设置资源 group；窗口销毁后由稳定业务边界调用 `Laya.Scene.gc()`。
- 模型先落数据再发原生事件；session.bindData 首次同步渲染，后续用 Laya.timer.callLater 合并，暂停取消订阅和待执行刷新，恢复读取当前快照，关闭释放。BaseGameWindow 使用同名 protected 方法，详见 [数据绑定](../../../../docs/ui-data-binding.md)。
- 红点由业务通过 lx.ui.redDots.set/setMany 更新；session.bindRedDot 或 RedDotBinding 引用已有 badge。GList 复用行先解除旧 key，再绑定新身份；不轮询、不因窗口关闭清空业务数据。
