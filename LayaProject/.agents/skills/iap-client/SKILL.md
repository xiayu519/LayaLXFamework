---
name: iap-client
description: 设计、接入或修复 IAP 商品查询、购买、恢复购买、收据校验、交易确认、幂等发货、掉单补偿和支付平台适配时使用；普通商城 UI 与非支付平台能力不触发。
---

# IAP Client

1. 先读 [purchase-lifecycle.md](references/purchase-lifecycle.md)，再检查 `PurchasePlatform` 及目标商店当前官方文档。
2. 商店 SDK 与 Native 桥接只在 `src/framework/platform/` 实现；业务使用统一结果模型，Web unsupported 不得伪造成功。
3. 购买、校验、发货与交易确认是可恢复状态机。以稳定 transaction id / purchase token 幂等，重复回调不得重复发货。
4. 客户端不自行判定最终权益；收据或 purchase token 交给可信服务校验。确认交易仅在权益安全落账后执行。
5. 测试成功、取消、pending、失败、重复回调、重启恢复、校验超时和确认失败；真实商店 Sandbox 验收无法 Headless 时必须明确列为未验证项。
