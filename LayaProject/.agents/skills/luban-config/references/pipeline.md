# Luban pipeline

- 源：仓库外层 `Design/config/*.xlsx` 与 `Design/tools/luban.conf`。
- 工具：仓库内固定 `Design/tools/Luban`；`LUBAN_VERSION` 锁定精确版本，`doctor` 校验 `.NET 8+` 与工具版本。
- 生成：`npm run config:generate` 输出 `src/game/generated/config/schema.ts` 和启动所需的 `assets/bootstrap/config/game/*.bin`，并生成路径稳定的 `.meta`。
- 校验：`npm run config:validate` 只验证源可生成；`npm run config:check` 在系统临时目录重生成并逐字节对比，不复制 Laya 项目。
- 运行时：Laya 3.4 的 `Loader.BUFFER` 返回持有 `data` 的 `TextResource`；取出二进制后交给 `Uint8Array/DataView/TextDecoder` ByteBuf，不引入 Node `buffer` polyfill。
- 新表必须属于 client group `c`，文件名和 ID 保持稳定；删除/改名应作为数据契约变更评审。
