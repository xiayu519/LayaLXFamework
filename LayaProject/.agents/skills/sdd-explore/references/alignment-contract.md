# Alignment Contract

## Risk labels

- Direct：目标、行为、实现路径和验收明确，不改变公共 API、schema、持久化格式、资源生命周期或工作流语义。
- Planned：存在会改变结果的需求、验收或设计选择，写入前需要批准。
- Deep：框架、公共契约、schema、生成规则、破坏性迁移、Codex 工作流、受保护边界或高回滚成本改动。无论描述多明确，先只读探索并取得批准。

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

Planned/Deep 必须等待明确批准。获批后可一次完成必要文件，不按文件数量重复确认。若公共语义、关键数据流、用户可见结果、受保护边界或失败策略需要超出已批准内容，停止并重新对齐；局部实现细节或文件数量变化不触发重新确认。
