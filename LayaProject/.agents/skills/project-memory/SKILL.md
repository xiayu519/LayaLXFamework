---
name: project-memory
description: 查找既往踩坑、开发者反馈或架构决定，或在验证后沉淀有证据且可复用的项目经验时使用；临时进度、猜测和普通实现不触发。
---

# Project Memory

1. 开始相关任务时运行本 Skill 的 `scripts/project-memory.mjs search <关键词>`，只读取命中的少量条目；从 `src/game/<game-id>` 执行时会合并公共与当前游戏记忆。
2. 按 [memory-policy.md](references/memory-policy.md) 判断是否值得记录。用户明确纠正、已复现问题及经验证的长期决定优先。
3. 框架经验写入根 `.codex/memory/`；单个游戏经验写入 `src/game/<game-id>/.codex/memory/`。使用 `assets/` 对应模板，并更新同作用域 `INDEX.md`。
4. 新事实不得覆盖旧事实：过时条目标为 `superseded` 并链接替代项；不得保存密钥、凭据、个人信息或大段日志。
5. 写入后从 `LayaProject` 运行 `npm run check:memory`，一次检查公共与全部游戏作用域。
