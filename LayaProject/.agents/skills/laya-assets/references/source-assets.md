# Source asset invariants

- `settings/BuildSettings.json` 的 `startupScene` 必须解析到对应 `.ls.meta` UUID。
- `.ls/.lh` 中脚本组件 `_$type` 与 `scriptPath` 必须匹配目标 `.ts.meta`。
- 同类源资产 UUID 全局唯一；`_$ref` 必须指向同一资产树内真实节点。
- `res://<uuid>` 必须存在对应 `.meta`；移动源文件时同步维护引用而非生成第二个身份。
- 字符串动态加载的启动资源根需要进入 `BuildSettings.alwaysIncluded`，并用发布后 manifest/文件检查证明入包；功能分包由独立的小游戏分包流程负责。
- Luban 人工源在外层 `Design/Tables`；生成的 `assets/bootstrap/game/tables/*.bin` 带确定性 `.meta`。普通 JSON 不属于该生成链。
- 资产修改必须同时通过本地结构检查与 LayaAir 3.4.1 官方解析器；解析失败修复源资产，不在运行时绕过。
