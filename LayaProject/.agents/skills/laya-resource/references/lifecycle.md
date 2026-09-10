# Resource Lifecycle

- `HierarchyLoader` 将 load options 传播给 Prefab/Scene 的依赖；给 `.lh/.ls` 指定 group 等于把其纹理、材质等依赖一起登记。
- `Loader.groupMap` 的成员是累加的；`clearResByGroup()` 遍历 URL 强制清缓存，但不移除成员，也不按 Resource referenceCount 提供所有权隔离。
- 普通共享内容依靠 Laya Resource 引用：显示命令、Prefab 依赖和组件在创建/销毁时维护引用。
- GLoader 用 load ID 拒绝旧请求。3.4.1 ImageRenderer 与 DrawTextureCmd 在已绘制纹理直接替换时重复增减引用，换图组件使用 DynamicImage.lh（仍是原生 src API），不建纹理 lease。Web 渲染单元池归还后的纹理/owner 暂留由限定版本 LayaGraphicsCleanup 修复；升级重审，不推广到其他后端，见 [完整依据及探针](../../../../docs/ui-resource-lifecycle.md)。
- UI 异步 bind/onBind 的原始 Promise 必须被追踪至结束，不能只等待已取消的 show。业务在 binder 内 await/return 所属工作；行身份查询晚到仍须自行检查 token/ID。
- 推荐顺序：invalidate async → Event/Timer/Tween cleanup → destroy node/component → await pending load/render settle → `Laya.Scene.gc()`。
- `Texture` 包装对象可能是 unmanaged；释放验证应同时观察 `referenceCount` 和底层 `bitmap.destroyed`，不要只看包装对象 `destroyed`。
- `Resource.cpuMemory/gpuMemory` 用于前后快照；稳定性应以重复进入/退出后的平台内存曲线为准。
