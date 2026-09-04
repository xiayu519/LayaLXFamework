---
type: decision
scope: framework-runtime
description: UI、动态纹理、Prefab 池、音频和 Spine 用 owner scope 与资源 lease 明确生命周期，业务停机后才清共享资源。
trigger: 新增持有监听、异步操作、显示对象、声道或 Loader 资源的运行时能力时
status: superseded
last_verified: 2026-09-04
source: user-confirmed
---

# Runtime resource ownership

## Context

单靠 Loader cache 或内存数字无法证明对象不再使用资源；窗口 Hide、池化实例、声道与 Spine 节点的寿命也不同。

## Decision

副作用必须有 owner；窗口区分 lifetime 与 presentation。资源使用者 acquire group lease，释放自身对象后 release；活跃 lease 阻止全量清理。`AppBootstrap` 逆序停机时先停止业务服务，最后执行共享运行时清理。

## Consequences

新能力必须测试晚到回调、重复清理、外来/重复归还和失败路径；不能用强制 `clearRes` 绕过所有权错误。

## Re-evaluate when

Laya 提供覆盖这些跨对象所有权语义的原生统一机制时。
