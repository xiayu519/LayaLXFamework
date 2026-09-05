---
name: sdd-explore
description: 变更共享 API、生命周期契约、持久化 schema、生成规则或 Codex 工作流语义前只读对齐；共享语义纠正及高回滚成本改动也触发。已批准且边界未变、框架内部保契约修复及未证明应公共化的业务候选不触发。
---

# SDD Explore

本 Skill 只读探索，不修改文件、安装依赖或执行外部写操作。

1. 检查现有代码、配置、工具行为和相关官方 API，区分事实、推断与待选择项。
2. 只追问会改变结果的问题；安全细节采用明确假设继续推进。
3. 按 [alignment-contract.md](references/alignment-contract.md) 判断 Direct、Planned 或 Deep。
4. 未获授权的 Planned/Deep 给出简洁 Change Contract，等待明确批准后再写入；用户明确要求实施已列明方案即为批准，不因跨轮次或文件增多再问一次。
5. 同一会话已批准且语义边界未变化时继续实施；若发现必须改变公共语义、保护边界或失败策略，停止扩展并重新对齐。
