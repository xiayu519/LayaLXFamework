---
name: shared-change-gate
description: 业务实现过程中发现公共能力不足，拟把代码上移到 src/framework、修改 LX/共享契约或多人工作流，但尚未证明应公共化时使用；先停止该边界写入并判断保持 game 局部还是提交公共变更。已批准的公共改动不触发。
---

# Shared Change Gate

本 Skill 只读判断候选边界，不修改共享文件。

1. 先读 [promotion-criteria.md](references/promotion-criteria.md)，检查当前业务需求、现有 framework、Laya 原生能力及真实消费者。
2. 业务安全可继续的局部工作不必停止；只暂停候选共享边界。若目标文件出现并行语义修改，停止并报告冲突。
3. 不能证明公共性时明确放回 `src/game/`，不得以“以后可能复用”为理由上移。
4. 能证明公共性时给出消费者、稳定语义、API/失败边界、影响文件、迁移与验证，并提交 Change Contract 等待批准。
5. 开发者纠正立即作用于当前任务；验证后仅将有证据且可复用的纠正写入项目记忆。
