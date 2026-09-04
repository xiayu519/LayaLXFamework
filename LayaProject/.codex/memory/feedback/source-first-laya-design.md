---
type: feedback
scope: framework-workflow
description: Laya 框架设计必须先严格审查固定版本源码，禁止凭想象重复造引擎已有能力。
trigger: 评估、设计或扩展任何 Laya 运行时公共模块时
status: active
last_verified: 2026-09-04
source: user-confirmed
---

# Source-first Laya design

## Confirmed preference

先以 LayaAir 3.4.1 官方源码和本机实际运行时为依据，再决定是否需要高级扩展；不能仅凭跨引擎经验或 API 名称造一套平行框架。

## Required behavior

涉及引擎生命周期的公共改动先运行 `npm run check:engine-source`，读取任务相关源码，列出原生能力与缺口。只有明确缺口才新增最薄扩展，并用真实 Headless 行为验收。

## Evidence

本次审查后删除 ResourcePolicy、SceneRouter、SpineService、DynamicTextureBinding、自建 Clock；Timer、GLoader、共享纹理、Prefab pool、UI modal/Destroy 与停机已由发布包 Headless 探针验证。
