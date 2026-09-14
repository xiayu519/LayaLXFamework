# 2D 性能预算

`settings/PerformanceBudgets.json` 以 `minigame-low-end` 作为 UI、Spine、Prefab 与 DrawCall 的公共设计基线。Headless 启动页直接读取该文件的 startup 预算，不再在探针里复制数值。

App 的 `app-low-end` 继承同一渲染基线，但不能因为小游戏通过就宣称 App 已通过。App 仍必须提供目标设备的帧耗时、CPU/GPU 内存、填充率、热稳定和前后台恢复证据；小游戏另需包体证据。执行 `npm run validate:performance` 检查这种继承关系没有被删除。

预算按“场景 × 平台 × 设备档位”扩展。启动页预算只是回归护栏；加入主界面、战斗或活动页后，应在对应 profile 的 `scenes` 中记录真实发布包基线。`lx.performance.capture()` 读取 Laya statAgent，UI 层级不承诺合批，不能用静态“DC 层”代替测量。

3.4.1 的 CT 统计是约一秒窗口的平均值，不是当前帧峰值。`capture().statisticsReady` 在首个窗口发布前为 false，`assertBudget()` 拒绝这一未就绪快照，Headless 等待真实窗口再判断预算；非法、负数或非有限测量值也不能通过。

`cpuBytes` 仅是 `Resource.cpuMemory` 账面值，不代表 JS heap/进程 RSS。`gpuBytes` 使用 driver 的 `StatElement.M_GPUMemory`（MiB 转 bytes），覆盖纹理/缓冲估算；不能用 3.4.1 中可能为 0 的 `Resource.gpuMemory` 冒充 GPU 总量，也不声称等于物理 VRAM。Headless 额外验证非零渲染/GPU 统计和超预算负例。

## UI 更新与渲染策略

普通 GWidget 分组和 stackingRoot 都不是 Canvas 式的渲染隔离。ui2 原生布局按脏标记更新；RenderPass 失效时重新收集、排序和合批。窗口根节点排序只涉及同宿主的窗口，不遍历其全部列表项，但不能据此承诺其他窗口不参与重新合批。

窗口直接挂各自 uiRoot，应用 GWindow 直接挂原生 GRoot。仅在打开、关闭和置顶时同步顺序，避免重复 setChildIndex；不用额外“DC 层”或自建渲染通道。固定骨架保持 full/safeContent 和 top/full/mid/bottom。

缓存和合批优化使用 Prefab 中原生属性，默认不全局开启：

- 复杂且少变的静态区域可实测 cacheAs="bitmap"；动态列表、动态图标、倒计时默认不缓存整个窗口，避免反复重绘 RenderTexture。
- 当前 3.4.1 实现只识别 bitmap，不能沿用旧版本 cacheAs="normal" 的教程。
- drawCallOptimize 是渲染元素重排优化，可能增加 CPU 成本；只对需要的局部容器实测后启用。
- 优先使用合理图集与连续绘制顺序。材质、纹理、混合与裁剪状态影响合批，不承诺每个 UI 一个 DC。
- 公共遮挡是普通半透明矩形，不用 Sprite.mask 建立裁剪。列表继续使用必要的原生滚动裁剪。
- 数据通知用 bindData 合并，具体控件仍按变化更新。旅行背包选择物品只刷新选择区域；同长度的数据更新只重绘有变化的可见行，创建与回收继续交给原生虚拟列表。

## 可复测的窗口负载

`tests/game/logic/ui-render-performance.browser.mjs` 使用 12 个原生窗口，预热 65 帧，执行 60 次重开和 90 次文本更新，记录 DC、Resource/driver 统计、展示处理耗时、帧间隔和根节点重排次数。使用现有构建运行：

```sh
node tools/test-browser.mjs --suite targeted --probe tests/game/logic/ui-render-performance.browser.mjs
```

2026-09-11 Windows Headless Chromium + SwiftShader 对比：重开引起的根节点 setChildIndex 调用从 120 降到 60；数据更新均为 0；空闲/变化期 2D DC 均为 5，GPU 账面值均为 4,830,279 bytes。展示处理 p95 两次均约 0.5ms。初次帧间隔 p95 为 40.8ms/44.7ms，软件渲染和调度存在波动，这些数据不证明帧率提高，也不代表手机真机性能。原始采样保存在本地 ui-render-before.log / ui-render-after.log。

最终构建独立复测 ui-render-final.log：重排次数与 DC/GPU 数值相同，展示处理 p95 约 0.6ms、帧间隔 p95 42ms。可确认减少了重复排序调用，不能由这些波动的耗时样本推断整体性能提升。

探针以 20 个 2D DC 作为此固定负载的回归上限，并断言数据更新不重排窗口。后续仍需长期 heap/driver 内存趋势和目标设备相同负载的帧耗时、温升、填充率验证；Resource.cpuMemory 为 0 不代表没有 JS 内存。
