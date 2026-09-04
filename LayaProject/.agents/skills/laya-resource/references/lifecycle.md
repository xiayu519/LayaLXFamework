# Resource Lifecycle

- `HierarchyLoader` 将 load options 传播给 Prefab/Scene 的依赖；给 `.lh/.ls` 指定 group 等于把其纹理、材质等依赖一起登记。
- `Loader.groupMap` 的成员是累加的；`clearResByGroup()` 遍历 URL 强制清缓存，但不移除成员，也不按 Resource referenceCount 提供所有权隔离。
- 普通共享内容依靠 Laya Resource 引用：显示命令、Prefab 依赖和组件在创建/销毁时维护引用。
- `GLoader` 用 load ID 拒绝旧请求；`ImageRenderer` 的绘制命令持有 Texture 引用。业务无需再包一层动态纹理 lease。
- 推荐顺序：invalidate async → Event/Timer/Tween cleanup → destroy node/component → await pending load/render settle → `Laya.Scene.gc()`。
- `Texture` 包装对象可能是 unmanaged；释放验证应同时观察 `referenceCount` 和底层 `bitmap.destroyed`，不要只看包装对象 `destroyed`。
- `Resource.cpuMemory/gpuMemory` 用于前后快照；稳定性应以重复进入/退出后的平台内存曲线为准。
