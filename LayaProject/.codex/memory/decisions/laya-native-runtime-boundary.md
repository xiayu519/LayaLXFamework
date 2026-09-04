---
type: decision
scope: framework-runtime
description: 共享框架先使用 LayaAir 3.4.1 原生生命周期，只保留有稳定业务语义的薄扩展。
trigger: 新增或修改 Timer、Scene、Loader、UI 动态图片、Prefab pool、Audio、Spine 或资源回收能力时
status: active
last_verified: 2026-09-04
source: user-confirmed
---

# Laya native runtime boundary

## Context

源码审查证明 Laya 已提供 Timer、Event、Tween、Pool、Scene、Loader/Resource、SoundManager、GLoader 和 Spine 组件生命周期。原有 ResourcePolicy/lease、SceneRouter、SpineService、DynamicTextureBinding 与 Clock 原语重复能力或错误描述所有权。

## Decision

`LX.Res` 精确返回 `Laya.loader`，`LX.Scene` 精确返回 `Laya.Scene`。删除平行资源、场景、Spine、动态图片和时钟抽象。层级加载默认不设置 group；先销毁节点/组件，等待加载和渲染提交稳定，再在功能切换或停机边界调用 `Laya.Scene.gc()`。UIRouter、PrefabPoolService 和 AudioService 只保留 Laya 没有提供的业务约束。

## Consequences

新增公共能力必须先核对固定版本源码，不能直接操作 Resource 私有引用 API。释放验证需要真实 Headless 生命周期探针，而不是只验证自建计数器。

## Re-evaluate when

升级 LayaAir，或出现多个真实业务消费者且原生 API 无法表达稳定的共同失败边界时。
