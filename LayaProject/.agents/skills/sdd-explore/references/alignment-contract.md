# Alignment Contract

## Risk labels

- Direct：目标与验收可从上下文确定，不改变共享语义或保护边界；范围内可逆实现细节由代理选择，不要求用户预先给出实现路径。
- Planned：存在无法通过检查消除、会实质改变用户结果的需求或设计选择；先完成独立工作，再对齐该选择。
- Deep：改变公共 API/生命周期契约、schema、生成规则、共享工作流语义、保护边界，或具有高回滚成本。仅位于 framework 不构成 Deep；保持既有契约的内部缺陷修复按对应领域 Skill 实施。

语义和回滚成本决定标签，文件数与 diff 大小不决定标签。

## Change Contract

```markdown
## Change Contract

- Goal / user-visible outcome:
- Success criteria:
- Allowed changes and protected boundaries:
- Recommended design:（存在实质选择时）
- Validation and failure/rollback behavior:
- Stop / re-alignment conditions:
```

批准针对目标、允许的语义变化和保护边界，不针对文件数或每轮操作。用户明确要求实施已列明方案，或明确指定共享变更及其可观察结果，即已授权；安全且范围内的实现选择不再提请批准。分析请求不授权写入。

未获授权的 Planned/Deep 先完成只读调查并给出上述契约，再等待该边界的批准。只有新增公共语义、关键数据流、用户结果、保护边界或失败策略超出授权时才重新对齐；命名、代码风格、文件数量变化及普通纠正直接纳入当前工作。暂停时标明具体边界与尚缺的决定，其他独立工作继续。
