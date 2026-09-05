---
name: ts-maintainability
description: 审查或重构 TypeScript 职责、依赖循环、超大文件、类型逃逸和模块边界时使用；仅修复局部行为且结构不变时不触发。
---

# TypeScript Maintainability

1. 保持单一变更原因和显式依赖方向；优先组合小对象，不以 Manager/Helper 汇集无关职责。
2. `src` 非生成 TS 超过 500 行必须审查拆分，超过 800 行门禁失败；禁止 `@ts-nocheck`、`@ts-ignore` 和运行时循环依赖。
3. 生成代码留在 `src/game/<game-id>/generated/`，不为满足行数修改生成物；规则应在 schema、模板或生成流程修复。
4. 重构保持公共契约和行为测试；公共层变化先走共享变更判断。运行 `npm run typecheck`、`npm test`、`npm run check:architecture`。
