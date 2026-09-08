---
type: decision
scope: codex-workflow
description: GPT-6 日常开发以 Medium 验收，不自动升降档；授权边界明确、验证按风险、历史规则不混入当前上下文。
trigger: 调整 Codex 模型强度、工作流语义、记忆检索或游戏任务验证时。
status: superseded
last_verified: 2026-09-08
source: user-confirmed
---

# GPT-6 workflow

档位定位已由 [GPT-6 effort compatibility](../feedback/gpt6-effort-compatibility.md) 更正：Medium 是个人可能选择，不是工作流目标或支持下限。下文保留初次迁移时的理解与验收历史。

## Decision

用户批准迁移 GPT-6，并明确希望后续日常开发使用 Medium。执行与 Plan 的默认值只由 `.codex/config.toml` 维护，当前显式选择优先；验收不降级，失败报告证据而不静默升档。继承 [model policy](codex-model-policy.md) 的单点配置和受控委派原则，替代其保留旧默认的决定。

已授权范围内的可逆实现自主完成；普通纠正不重新审批。新共享语义或关键选择超出授权时只暂停相关边界。模型更强不等于可以取消公共、下游、存档或冲突保护。

## Evidence and consequences

旧根规则的宽泛暂停条件、领域 Skill 的旧游戏路径及全量测试要求已统一。记忆检索曾把 superseded 固定模型策略排入默认结果且不显示状态；现默认仅 active，历史查询显式开启并标记状态，正文保留。

Medium 首次分类把已批准 ui2 修复额外路由到 Headless；明确“领域调用现成验收命令”与“专项构建/诊断链路”后，原 expected 不变通过。两次独立 Medium 实现完成分数格式与纯逻辑冷却，均做针对性测试，无重复审批。完整迁移记录在 `docs/gpt6-workflow-validation.md`，分类不能证明所有游戏或平台的执行质量。

## Re-evaluate when

用户改变成本/质量偏好、客户端行为变化，或真实游戏任务出现可复现的路由、授权、执行或验证失败。优先修正已定位规则，复验受影响项；不把单个困难任务变成自动升档规则。
