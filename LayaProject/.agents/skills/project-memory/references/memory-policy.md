# Project memory policy

项目记忆是仓库内、可审查的长期知识，不等同于 Codex 官方个人 Memories。

## 记录条件

满足以下任一条件且有证据时记录：

- 开发者明确纠正了工作方式、验收定义或长期偏好。
- 问题已复现并定位，修复或规避已通过相应验证。
- 架构/产品决定已经批准，未来任务必须遵守其语义。

临时进度、未证实推断、单次命令输出、容易从代码直接读取的事实不记录。敏感信息永不记录。

## 类型与字段

- `problems/`：复现条件、根因、修复、验证和防回归入口。
- `decisions/`：上下文、决定、理由、影响和重新评估条件。
- `feedback/`：开发者纠正、适用范围和后续执行方式。

每条必须包含 `type`、`scope`、`description`、`trigger`、`status`、`last_verified`、`source`。`source` 仅允许 `user-confirmed`、`code-verified`、`external-verified`；`status` 仅允许 `active`、`superseded`、`archived`。

INDEX 只保留一行摘要链接；正文每条不超过 4096 bytes。若规则升级，保留旧条目并标记替代关系，避免无痕改写历史。
