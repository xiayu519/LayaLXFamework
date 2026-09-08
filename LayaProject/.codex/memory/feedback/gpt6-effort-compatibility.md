---
type: feedback
scope: codex-workflow
description: GPT-6 工作流兼容各标准推理档位；Medium 只是个人可选偏好，不是设计目标、支持下限或固定执行要求。
trigger: 解释或调整 Codex 模型强度、工作流兼容范围、默认配置及验收时。
status: active
last_verified: 2026-09-08
source: user-confirmed
---

# GPT-6 effort compatibility

用户澄清：工作流面向 GPT-6，个人以后可能选择 Medium，但 Light、High 等也必须支持。替代 [初次迁移记录](../decisions/gpt6-workflow.md) 中将 Medium 作为工作流目标的理解。

`low`（Light）、`medium`、`high`、`xhigh`、`max` 使用同一套规则、Skill、授权与验收；不按档位复制工作流或限制任务种类。默认值只在 `.codex/config.toml` 维护，用户显式选择优先，不自动升降档；当前 medium 默认不是锁定。

兼容不等于各档能力、成本或一次成功率相同，不能把分类结果宣传为全领域执行证明。验证下限必须包含 Light 的实际任务产物，高档复杂任务独立验收；具体结果与计量限制只在 `docs/gpt6-workflow-validation.md` 维护，不在记忆中重复易过时的成绩。
