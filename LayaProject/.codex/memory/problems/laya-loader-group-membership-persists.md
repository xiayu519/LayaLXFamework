---
type: problem
scope: runtime-resource
description: LayaAir 3.4 Loader group 对 URL 的登记是累加的，clearResByGroup 清缓存但不移除 groupMap 成员。
trigger: 新增资源 group、复用已释放资源、动态图片或跨功能共享资源时
status: superseded
last_verified: 2026-09-04
source: code-verified
---

# Loader group membership persists after clear

## Reproduction

LayaAir 3.4.1 的 `Loader.setGroup` 和带 `group` 的 `loader.load` 都把规范化 URL 加入 `Loader.groupMap[group]`。调用 `clearResByGroup(group)` 后，该集合仍保留 URL；同一资源再次加载后仍会被该 group 清理。

## Root cause

`clearResByGroup` 只遍历集合调用内部资源清理，不删除 `groupMap[group]`，也不提供移除单个 URL 组成员的公开 API。同一 URL 改挂到另一 group 会让它同时属于多个组，任一组清理都可能卸载另一所有者正在使用的缓存。

## Fix or avoidance

在一个 `ResourcePolicy` 生命周期内，规范化后的 URL 只能归属一个 group；共享内容统一放入 shared group。普通 group 清理后仍保留登记，只有运行时最终 `releaseAll()` 成功后才清空策略自身的登记状态。

## Verification

`tests/LayaAdapters.test.ts` 覆盖同组重复登记、释放后跨组登记拒绝，以及全量释放的失败隔离；LayaAir 3.4.1 `laya.core.js` 已核对 `setGroup`/`clearResByGroup` 实现。
