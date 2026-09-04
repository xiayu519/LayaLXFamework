---
name: laya-resource
description: 实现或诊断 Laya.loader 加载、资源 group、缓存、释放时序、ContentCatalog、ResourcePolicy 和 CPU/GPU 内存快照时使用；源资产序列化不触发。
---

# Laya Resource Lifecycle

1. 先读 [lifecycle.md](references/lifecycle.md)，并检查调用方的显示对象与异步生命周期。
2. 业务直接使用 `Laya.loader`，加载选项携带明确 group；`ContentCatalog` 仅映射稳定 ID、URL、kind 和 group。
3. `ResourcePolicy` 只负责分组、释放边界和诊断，不复制 Loader 的缓存或引用管理。
4. 释放前先阻止异步回写并销毁引用资源的 UI/Scene，再清 group 和 unused resources；不得以诊断数字替代正确性。
5. 为加载失败和重复释放补测试；动态路径还需执行 `npm run validate:build` 或完整 Headless 验收。
