---
name: laya-platform
description: 接入或修改 Web、小游戏与 Native 的非支付平台能力、生命周期、安全区、前后台事件、SDK/桥接和 capability 检测时使用；IAP 交易流程不触发。
---

# Laya Platform

1. 共享平台契约和实现位于 `src/framework/platform/`，由 `src/game/bootstrap/` 选择并显式组装。
2. 业务只依赖能力契约，不读取平台全局；适配层把 SDK 回调转换成明确的成功、失败和 unsupported 结果。
3. capability 检测必须先于调用；Web 不支持的能力不得伪造成功，小游戏与 Native 桥接不得泄漏到 domain/application。
4. 前后台、重复回调和销毁后回调按幂等生命周期处理；安全区和设备信息需区分缺失值与真实零值。
5. 使用目标平台官方文档核对当前 API；至少运行类型、单测和架构检查，真实 SDK 行为列为对应平台验收项。
