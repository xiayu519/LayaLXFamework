# Luban pipeline

- 源：仓库外层 `Design/Tables/*.xlsx` 与 `Design/tools/luban.conf`。
- 工具：仓库内固定 `Design/tools/Luban`；`LUBAN_VERSION` 锁定精确版本，`doctor` 校验 `.NET 8+` 与工具版本。
- 生成：外层 `Design/genBin.bat` 与 `Design/genBin.command` 分别提供 Windows/macOS 双击入口，只转调既有 `npm run tables:generate`；输出位置由 `settings/GameProject.json` 指定，当前默认业务根为 `src/game/logic/generated/tables/schema.ts`，数据输出到 `assets/bootstrap/game/tables/*.bin`，并保留路径稳定的 `.meta`。
- 校验：`npm run tables:validate` 只验证源可生成；`npm run tables:check` 在系统临时目录重生成并逐字节对比，不复制 Laya 项目。
- 运行时：Laya 3.4 的 `Loader.BUFFER` 返回持有 `data` 的 `TextResource`；取出二进制后交给 `Uint8Array/DataView/TextDecoder` ByteBuf，不引入 Node `buffer` polyfill。
- 新表必须属于 client group `c`，文件名和 ID 保持稳定；删除/改名应作为数据契约变更评审。
- 普通 JSON、外部游戏数据和地图编辑器输出不进入本流程，也不触发本 Skill。
