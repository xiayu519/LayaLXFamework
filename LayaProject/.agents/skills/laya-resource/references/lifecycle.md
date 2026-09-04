# Resource lifecycle

Laya Loader 已提供缓存、并发、类型识别、group 与统一清理，本项目不复制 AssetManager/Bundle/引用管理器。

- 加载直接使用 `Laya.loader`，在 `ILoadOptions.group` 写业务 group。
- `ContentCatalog` 保存稳定 ID、URL、kind 和 group，不持有资源实例。
- `ResourcePolicy.assign` 在加载前登记 group；持有资源的窗口、池、音频或 Spine 句柄必须 acquire lease，最后一个 lease 释放后才能清 group。
- 释放顺序：失效异步回写 → 移除监听/计时 → Hide 或 Destroy UI/Scene → `clearResByGroup` → `Resource.destroyUnusedResources()` → snapshot。
- `Resource.cpuMemory/gpuMemory` 是诊断值，不是业务正确性的判据。
- 常驻启动资源与场景/功能资源使用不同 group，不按单文件任意 `clearRes` 制造悬挂引用。
- `snapshot.activeLeases` 与 tracked groups 用于定位泄漏；`releaseAll` 遇到活跃 lease 必须失败，不能强行卸载仍被使用的资源。
