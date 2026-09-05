---
type: decision
scope: codex-workflow
description: 模型默认值单点维护，尊重用户显式选择，不在 Skill 和评测脚本重复锁死模型。
trigger: 调整模型、子代理策略、工作流评测或处理已批准的框架优化时。
status: active
last_verified: 2026-09-05
source: user-confirmed
---

# Codex model policy

## Context

用户要求当前模型独立评估并实施框架与 Codex 工作流优化，不受旧模型工作方式限制。旧决定在 AGENTS、Skill、脚本和文档重复固定模型，容易覆盖用户当前选择。

## Decision

默认模型/强度只在 `.codex/config.toml` 维护；当前用户显式选择优先。Codex 默认单代理执行，仅跨独立风险边界或用户明确要求时委派；子代理默认继承主线程，不因命中 Skill 自动降档。保留已有默认配置，不假称文本指令能切换当前实际模型。

已批准且边界未变的方案直接实施与验证。仅位于 framework 不是 Deep 的充分理由；新共享语义、保护边界或失败策略超出批准范围仍须重新对齐。

## Consequences

语义评测读取配置并支持显式环境覆盖，检查无工具执行、正负路由和工作流决策；token 预算是执行后失败阈值而非服务端硬花费上限。

## Re-evaluate when

用户调整模型策略、官方配置优先级改变，或真实执行评测发现流程边界失效。替代 [Codex model floor](codex-model-floor.md)。
