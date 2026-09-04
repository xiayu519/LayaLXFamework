# ui2 Lifecycle

- `GWindow.show()` 交给 `GRoot.showWindow()`；Hide 从显示树移除并触发 presentation 清理。
- `GWindow.destroy()` 会先隐藏仍在 `GRoot` 的窗口。observer 在进入原生 destroy 前必须暂时解除，避免 Hide → router Destroy 重入。
- `UIRouter.snapshot/listVisible/listManaged/getTop/getBottom/closeTop` 是业务查询入口；排序读取真实父节点 index。
- layer 通过 `zOrder` 表达；最高可见 modal route 与 `GRoot.modalLayer.zOrder` 同步，实际遮罩插入仍由 GRoot 完成。
- `GLoader` 自带晚到请求防护与纹理引用管理；不要重复创建 DynamicTextureBinding。
- UI route 的 `.lh` 默认不设置资源 group；窗口销毁后由稳定业务边界调用 `Laya.Scene.gc()`。
