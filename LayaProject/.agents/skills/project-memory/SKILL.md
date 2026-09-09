---
name: project-memory
description: 查找既往踩坑、开发者反馈或架构决定，或在验证后沉淀有证据且可复用的项目经验时使用；临时进度、猜测和普通实现不触发。
---

# Project Memory

1. 有相关历史问题时运行 `node <本 Skill 目录>/scripts/project-memory.mjs search <关键词>`，脚本路径相对此 SKILL.md，保持任务 cwd。只读少量命中；无命中回到当前代码/文档，不全库补读。在 `src/game/<game-id>` 查询时合并公共与当前游戏记忆。
2. 记忆只是线索。采用前核对适用范围、日期和当前证据；当前用户指令、AGENTS、配置与已验证实现优先，记忆不新增审批、模型切换或验证要求。
3. 按 [memory-policy.md](references/memory-policy.md) 只记录有证据且不能从现行规则/代码直接获得的长期经验。框架经验写根 `.codex/memory/`，产品经验写当前游戏同名目录；使用 `assets/` 模板并更新 INDEX。
4. 过时、冲突或已被现行规则完整吸收的条目直接删除并清理链接；历史查 Git，不保留替代链。不要手改或同步 Codex 官方 `~/.codex/memories/` 生成状态。
5. 写入后从 `LayaProject` 运行 `npm run check:memory`，一次检查公共与全部游戏作用域。
