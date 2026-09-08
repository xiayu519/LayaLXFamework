---
name: laya-json-data
description: 加载或诊断外部游戏、地图编辑器和业务生成的 JSON 数据、类型校验、缓存与释放时使用；Luban Tables、玩家存档和 .ls/.lh 不触发。
---

# Laya JSON Data

1. JSON 与 Luban Tables 完全独立；按数据用途放进 `config/`、`data/`、`maps/` 或 `levels/`，不能仅因扩展名统一塞进 config。
2. 用 `ContentCatalog` 的 `data` 条目声明稳定 ID，由 `LX.Config` 调用 `Laya.loader` 的 `Loader.JSON` 并读取 3.4.1 `TextResource.data`；不实现第二套 JSON 解析器或 Loader。
3. 外部或编辑器 JSON 在消费边界提供类型校验器。校验失败不得保留缓存，也不能用无证据类型断言掩盖格式差异。
4. 功能退出先使消费者和异步回写失效，再调用 `LX.Config.release(id)`；共享数据必须由明确的上层 owner 决定释放时机。
5. 数据/校验器变化跑相关数据测试；目录与发布布局变化加 `validate:resource-layout`。加载、缓存、释放或构建收集变化才加真实发布探针，按 [Headless 范围](../laya-headless/references/verification.md) 选择，不因修改一个 JSON 数值默认全量构建。
