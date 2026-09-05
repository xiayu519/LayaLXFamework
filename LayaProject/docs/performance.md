# 2D 性能预算

`settings/PerformanceBudgets.json` 以 `minigame-low-end` 作为 UI、Spine、Prefab 与 DrawCall 的公共设计基线。Headless 启动页直接读取该文件的 startup 预算，不再在探针里复制数值。

App 的 `app-low-end` 继承同一渲染基线，但不能因为小游戏通过就宣称 App 已通过。App 仍必须提供目标设备的帧耗时、CPU/GPU 内存、填充率、热稳定和前后台恢复证据；小游戏另需包体证据。执行 `npm run validate:performance` 检查这种继承关系没有被删除。

预算按“场景 × 平台 × 设备档位”扩展。启动页预算只是回归护栏；加入主界面、战斗或活动页后，应在对应 profile 的 `scenes` 中记录真实发布包基线。`LX.Performance.capture()` 读取 Laya statAgent，UI 层级不承诺合批，不能用静态“DC 层”代替测量。
