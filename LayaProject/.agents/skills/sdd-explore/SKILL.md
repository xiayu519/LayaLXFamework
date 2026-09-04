---
name: sdd-explore
description: 只读对齐会改变结果的需求或验收不确定性，以及已明确要修改的框架、公共契约、持久化 schema、生成规则、Codex 工作流和高回滚成本改动；写入前产出 Change Contract。尚未证明应公共化的业务候选不触发。
---

# SDD Explore

本 Skill 只读探索，不修改文件、安装依赖或执行外部写操作。

1. 检查现有代码、配置、工具行为和相关官方 API，区分事实、推断与待选择项。
2. 只追问会改变结果的问题；安全细节采用明确假设继续推进。
3. 按 [alignment-contract.md](references/alignment-contract.md) 判断 Direct、Planned 或 Deep。
4. Planned/Deep 给出简洁 Change Contract，等待明确批准后再写入。
5. 同一会话已批准且语义边界未变化时继续实施；若发现必须改变公共语义、保护边界或失败策略，停止扩展并重新对齐。
