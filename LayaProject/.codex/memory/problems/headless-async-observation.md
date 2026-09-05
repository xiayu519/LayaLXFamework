---
type: problem
scope: headless-validation
description: Headless 对异步资源和 UI 生命周期使用固定短延时会在较慢 runner 产生假失败，应轮询可观察状态并保留超时上限。
trigger: 新增或修改 Headless 异步加载、UI、动画、对象池、资源释放和生命周期探针时
status: active
last_verified: 2026-09-05
source: external-verified
---

# Headless asynchronous observation

## Failure

Tip 首次 Prefab 获取在本机和 macOS 可于 `80ms` 内完成，但 Windows runner 偶尔更慢；固定延时读取到 `active=0` 后误判失败，稍后的队列状态已恢复正常。

## Guard

探针轮询明确的业务后置条件并设置有限超时，不以固定短延时猜测异步完成。Tip 的 500ms 节奏从首个视图实际可见后开始，单元测试必须覆盖首次异步获取慢于间隔的情况。

## Evidence

GitHub Actions run `33938750636` 复现仅 `firstTipQueued=false`；新增慢加载单测和原地 LayaAir 3.4.1 Headless 回归验证修复。
