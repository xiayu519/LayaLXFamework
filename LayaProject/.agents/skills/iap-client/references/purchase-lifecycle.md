# Purchase lifecycle

当前入口为 `lx.purchase`，初始化、恢复存档、事件与接入契约见 [支付模块设计](../../../../docs/payment-design.md)。订单状态来自可信订单服务，本地只持久化请求恢复线索：

```text
awaiting-payment -> awaiting-delivery -> delivered -> revoked
                 -> cancelled/failed
delivered + confirmation=required -> channel.finish -> confirmation=complete
```

- 渠道状态映射到现有契约，不直接替换模块状态名；purchase token / transaction id 必须稳定且唯一。
- 商品展示信息来自商店查询；服务端商品配置决定可授予权益，客户端价格和 receipt 都不是最终可信依据。
- consumable 发货、non-consumable 解锁与 subscription 有效期分别建模，不用一个布尔值覆盖。
- 服务器以交易 ID 幂等校验和发货；客户端可重试查询结果，不重复授予权益。
- pending、进程终止、断网、服务器超时与 finish/ack 失败都必须能在下次启动恢复。
- 目标商店的 finish/ack 时机、退款/撤销、恢复购买和 Sandbox 验收以实现时最新官方文档为准。
