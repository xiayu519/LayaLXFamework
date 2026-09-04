---
name: laya-render-performance
description: 评估或约束 Laya 2D DrawCall、三角形、CPU/GPU 资源指标及 UI/Spine 混合渲染时使用；纯业务耗时不触发。
---

# Laya Render Performance

1. 先确定场景、目标设备和稳定测量时点；读取 [budgets.md](references/budgets.md)。
2. 用 `LX.Performance.capture()` 读取 Laya statAgent，不以节点层概念臆测合批结果。
3. 同材质/纹理/混合/裁剪状态才可能连续合批；Mask、滤镜、缓存、文本、Spine 材质切换或穿插顺序都可能拆批。优先调整资产与显示顺序，不建立“DC 层”抽象。
4. 把基线和预算写入可重复验收；功能单测不能代替真实发布运行时指标。
