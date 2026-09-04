---
name: luban-config
description: 修改 Luban Excel schema、表数据、TypeScript-bin 生成、陈旧检查或运行时配置加载时使用；玩家存档与普通资源不触发。
---

# Luban Config

1. 先读 [pipeline.md](references/pipeline.md)；`Design/config` 是人工源，生成的 schema 与 `.bin` 不手改。
2. 修改表后运行 `npm run config:generate`，提交源表、生成代码、二进制和确定性 `.meta`；`npm run config:check` 必须能复现且拒绝陈旧/多余文件。
3. 运行时由业务 `GameConfigService` 加载 `.bin` 并安装到 `LX.Config`；共享框架只提供泛型注册表，不依赖具体表结构。
4. 至少用实际生成二进制测试 `ByteBuf` 和表查询；交付由纯 Headless 发布包再次加载同一 `.bin`。
