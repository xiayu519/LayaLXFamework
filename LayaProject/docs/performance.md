# 2D 性能预算

`settings/PerformanceBudgets.json` 以 `minigame-low-end` 作为 UI、Spine、Prefab 与 DrawCall 的公共设计基线。Headless 启动页直接读取该文件的 startup 预算，不再在探针里复制数值。

App 的 `app-low-end` 继承同一渲染基线，但不能因为小游戏通过就宣称 App 已通过。App 仍必须提供目标设备的帧耗时、CPU/GPU 内存、填充率、热稳定和前后台恢复证据；小游戏另需包体证据。执行 `npm run validate:performance` 检查这种继承关系没有被删除。

预算按“场景 × 平台 × 设备档位”扩展。启动页预算只是回归护栏；加入主界面、战斗或活动页后，应在对应 profile 的 `scenes` 中记录真实发布包基线。`LX.Performance.capture()` 读取 Laya statAgent，UI 层级不承诺合批，不能用静态“DC 层”代替测量。

3.4.1 的 CT 统计是约一秒窗口的平均值，不是当前帧峰值。`capture().statisticsReady` 在首个窗口发布前为 false，`assertBudget()` 拒绝这一未就绪快照，Headless 等待真实窗口再判断预算；非法、负数或非有限测量值也不能通过。

`cpuBytes` 仅是 `Resource.cpuMemory` 账面值，不代表 JS heap/进程 RSS。`gpuBytes` 使用 driver 的 `StatElement.M_GPUMemory`（MiB 转 bytes），覆盖纹理/缓冲估算；不能用 3.4.1 中可能为 0 的 `Resource.gpuMemory` 冒充 GPU 总量，也不声称等于物理 VRAM。Headless 额外验证非零渲染/GPU 统计和超预算负例。

后续框架级完善方向：独立合成场景、固定预热与采样窗、p95/p99 帧耗时、长期 heap/driver 内存趋势，以及目标平台相同负载的自动对比；不需要先实现游戏业务或支付。
