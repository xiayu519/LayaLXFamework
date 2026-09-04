# Purchase lifecycle

建议持久化状态机：

```text
created -> store-pending -> purchased -> server-validating
        -> cancelled     -> validation-rejected
        -> failed        -> entitlement-granted -> store-finished
```

- 具体状态名可按商店 API 调整，但 purchase token / transaction id 必须稳定且唯一。
- 商品展示信息来自商店查询；服务端商品配置决定可授予权益，客户端价格和 receipt 都不是最终可信依据。
- consumable 发货、non-consumable 解锁与 subscription 有效期分别建模，不用一个布尔值覆盖。
- 服务器以交易 ID 幂等校验和发货；客户端可重试查询结果，不重复授予权益。
- pending、进程终止、断网、服务器超时与 finish/ack 失败都必须能在下次启动恢复。
- 目标商店的 finish/ack 时机、退款/撤销、恢复购买和 Sandbox 验收以实现时最新官方文档为准。
