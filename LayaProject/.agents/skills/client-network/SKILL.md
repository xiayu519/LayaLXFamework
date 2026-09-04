---
name: client-network
description: 实现或诊断 HttpTransport、请求超时、取消、重试、错误映射、序列化和网络状态时使用；平台 SDK、资源下载与 IAP 交易状态不触发。
---

# Client Network

1. application 依赖窄接口；HTTP、DOM 网络对象和平台网络 API 保留在 infrastructure/platform。
2. 请求明确方法、URL、headers、编码、超时与取消语义；响应在边界完成状态码、内容类型和 schema 校验。
3. 只对幂等操作或具备幂等键的操作重试，采用有上限的退避；业务拒绝、超时、取消、离线与解析失败使用可区分错误。
4. 日志不得包含 token、receipt、个人信息或完整敏感响应；诊断信息保留 request id 与错误阶段。
5. 为超时、取消、非 2xx、无效 JSON、重复回调和重试上限补测试，然后运行类型、单测和架构检查。
