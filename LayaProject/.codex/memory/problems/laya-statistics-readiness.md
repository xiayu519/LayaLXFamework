---
type: problem
scope: laya-render-performance
description: Laya CT 首窗口未发布会返回零，Resource.gpuMemory 不能代表真实 driver 分配统计。
trigger: 添加 DrawCall 或 CPU/GPU 预算、检查零值性能结果、升级引擎统计接口时。
status: active
last_verified: 2026-09-05
source: code-verified
---

# Laya statistics readiness

## Reproduction

启动 ready 后立即读取 CT 计数会得到尚未发布的零值；3.4.1 WebGL driver 已分配纹理时 Resource.gpuMemory 仍可为零。

## Root cause

StatisticsContext 的 CT 计数按约一秒窗口发布平均值；WebGLInternalTex/GLBuffer 更新 driver 内存统计，与 Resource 静态账面统计不是同一条路径。

## Fix or avoidance

capture 用 CT_FPS 判断窗口就绪，预算拒绝未就绪和非法数值。GPU 使用 M_GPUMemory 并将 MiB 转 bytes；CPU 明确仅为 Resource 账面值，不能宣称 JS heap/进程内存。平均 DC 不能证明帧峰值。

## Verification

`tests/framework/RenderPerformance.test.ts` 覆盖就绪、非有限值、GPU 计量与超预算。`settings/LayaSourceBaseline.json` 含对应官方 v3.4.1 源码哈希，`tools/browser-network-probes.mjs` 检查真实渲染非零和 GPU 预算负例。
