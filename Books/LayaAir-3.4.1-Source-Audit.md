# LayaAir 3.4.1 Source Audit

审计基线：官方仓库 tag `v3.4.1`，commit `f368b43098fe6bde7b961546114e71907c5f8a98`。

本机 LayaAir CLI 安装在 `%USERPROFILE%\.layaair\3.4.1`。完整 TypeScript 源码可从以下 source map 的 `sourcesContent` 离线读取：

- `Resources/engine/libs/laya.core.js.map`
- `Resources/engine/libs/laya.ui2.js.map`
- `Resources/engine/libs/laya.spine.js.map`
- `Resources/engine/libs/laya.webgl_2D.js.map`

`settings/LayaSourceBaseline.json` 保存 27 个关键文件的 SHA256（含 Node/Sprite、StatisticsContext 与 GPU driver）；`npm run check:engine-source` 会提取、规范化并逐项比对，避免只凭 `.d.ts` 或记忆设计框架。

## 已审计结论

- `Timer/EventDispatcher/Tween/Pool/Loader/Scene/LocalStorage/HttpRequest/SoundManager` 提供基础原语，不建立同义管理器；原生行为不等于框架失败契约完整。
- `HttpRequest._onLoad` 原生只接受 200/204/0；薄扩展接受完整 2xx，框架处理 JSON 空响应、解析/结构错误和二进制编码边界。
- `Node.destroy` 在用户 onDisable/onDestroy 抛错前可能已置 destroyed；UI/Pool 不能据此宣称完整清理，必须保留失败证据。
- `StatisticsContext` 的 CT 是发布窗口平均值；首窗口前的 0 不可验收。GPU driver 的 M_GPUMemory 与 Resource.gpuMemory 不是同一计量链。
- `HierarchyLoader` 会把 load options 传播给依赖；`Loader.clearResByGroup()` 强制清组且不移除 group 成员，因此层级资源默认不使用功能 group。
- `Resource.destroyUnusedResources()` 只销毁引用数为 0 且未 lock 的资源；显示命令、Prefab 依赖和 Spine 组件负责引用增减。业务不调用私有引用 API。
- `GLoader` 使用请求 ID 拒绝晚到结果；`ImageRenderer` 的绘制命令持有纹理引用，清空或销毁会释放。
- `GWindow.destroy()` 会先从 `GRoot` 隐藏，再销毁；路由 observer 必须防止 Hide → Destroy 重入。`GRoot` modal 遮罩按窗口子节点顺序调整。
- `Scene` 是正式的 2D 场景类型，提供 open/close/destroy/gc 和 `unDestroyedScenes`；无需另造基础场景概念。
- `SoundManager` 使用独立 `AudioDataCache`，不能用普通 Loader group lease 表示解码音频所有权。
- `Spine2DRenderNode.source` 加载 `SpineTemplet`；init/reset/disable/destroy 会维护 templet 引用，templet 再拥有纹理与材质依赖。

## 验证边界

当前 Headless 探针已覆盖 Timer、GLoader 晚到结果、共享纹理引用、Prefab pool、ui2 modal/Destroy 和 runtime shutdown。仓库暂无代表性 Spine 与音频资产，因此只能证明模块、组件和发布链路存在，不能宣称真实动画效果、音频解码兼容性或目标设备性能已验收。
