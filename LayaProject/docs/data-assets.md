# JSON 与 Luban Tables

两条数据链完全独立：普通 JSON 由 `LX.Config` 管理，Luban 生成表由 `LX.Tables` 管理。JSON 不经过 Luban，Luban 任务也不处理外部或编辑器 JSON。

## JSON

把稳定 ID 注册为 `ContentCatalog` 的 `data` 条目：

```ts
{
    id: "map.level-001",
    url: "packages/maps/maps/level-001.json",
    kind: "data",
}
```

通过可选校验器加载；底层仍是 `Laya.loader.load(url, { type: Laya.Loader.JSON })`。LayaAir 3.4.1 返回 `TextResource`，`LX.Config` 只取公开的 `data`：

```ts
const map = await LX.Config.load<MapData>("map.level-001", isMapData);
// 使用结束且上层 owner 确认无人共享后：
LX.Config.release("map.level-001");
```

同 ID 并发加载复用一个请求。校验失败不保留缓存；release/dispose 会使晚到结果失效并清理 Loader 缓存。JSON 根据含义放入 `config/`、`data/`、`maps/` 或 `levels/`，不能按扩展名粗暴归类。

## Luban Tables

```text
Design/Tables/*.xlsx
  -> npm run tables:generate
  -> src/game/generated/tables/schema.ts
  -> assets/bootstrap/tables/game/*.bin
  -> GameTablesService
  -> LX.Tables
```

生成文件不手改。提交前运行 `npm run tables:check`；它在系统临时目录重生成并比较，不复制 Laya 项目。
