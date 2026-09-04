# Render budgets

- 使用 `Laya.LayaGL.statAgent` 的 `CT_2DDrawCall`、`CT_DrawCall`、`CT_Triangle` 和 `Laya.Resource` 内存作为同一运行时快照。
- Headless 启动页预算是回归护栏，不代表战斗目标；战斗、活动页和低端设备必须各自建立场景基线。
- UI 与 Spine 混排时按实际渲染顺序取样。层级只解决视觉与交互优先级，不承诺合批；先减少材质、纹理、Mask、滤镜和穿插切换。
- 预算失败保留实际值，不通过关闭统计、放宽到无意义阈值或静态推断来消除失败。
