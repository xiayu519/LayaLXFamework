---
name: project-memory
description: 查找既往踩坑、开发者反馈或架构决定，或在验证后沉淀有证据且可复用的项目经验时使用；临时进度、猜测和普通实现不触发。
---

# Project Memory

1. 开始相关任务时运行 `node .agents/skills/project-memory/scripts/project-memory.mjs search <关键词>`，只读取命中的少量条目。
2. 按 [memory-policy.md](references/memory-policy.md) 判断是否值得记录。用户明确纠正、已复现问题及经验证的长期决定优先。
3. 条目存入 `.codex/memory/problems|decisions|feedback/`，使用 `assets/` 中对应模板，并在 `.codex/memory/INDEX.md` 增加一句链接。
4. 新事实不得覆盖旧事实：过时条目标为 `superseded` 并链接替代项；不得保存密钥、凭据、个人信息或大段日志。
5. 写入后运行 `npm run check:memory`，确保索引、证据字段、路径和体积预算有效。
