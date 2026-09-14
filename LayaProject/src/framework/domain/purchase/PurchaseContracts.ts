import type { PurchaseAttempt, PurchaseOrder, PurchaseRecoveryRequest, PurchaseRequest, PurchaseTransaction, PurchaseTransactionId } from "./PurchaseTypes";

/** 实现只需接入对应渠道；取消信号结束客户端等待，不代表撤销真实交易。 */
export interface PurchaseChannel {
    start(onTransaction: (transaction: PurchaseTransaction) => void, signal: AbortSignal): void | Promise<void>;
    stop(): void | Promise<void>;
    launch(order: PurchaseOrder, channelData: unknown, signal: AbortSignal): Promise<PurchaseAttempt>;
    /** 有商店恢复能力时提供；返回值必须绑定原账号，不能套用当前登录账号。 */
    recover?(accountId: string, signal: AbortSignal): Promise<readonly PurchaseTransaction[]>;
    /** 仅在服务端已发货后调用；重复确认必须安全。由服务端确认的渠道无需提供。 */
    finish?(transaction: PurchaseTransactionId, signal: AbortSignal): Promise<void>;
}

/** 游戏实现数据映射；不在框架规定协议号、传输方式或奖励结构。 */
export interface PurchaseBackend {
    /** 以账号和请求号幂等创建；channelData 只透传给渠道，不持久化。 */
    createOrder(request: PurchaseRequest, signal: AbortSignal): Promise<{ readonly order: PurchaseOrder; readonly channelData?: unknown }>;
    reportAttempt(order: PurchaseOrder, attempt: PurchaseAttempt, signal: AbortSignal): Promise<PurchaseOrder>;
    verifyTransaction(transaction: PurchaseTransaction, signal: AbortSignal): Promise<PurchaseOrder>;
    /** 查询请求号并发现服务端未完成订单；已受理但客户端未拿到订单号的请求也必须可恢复。 */
    reconcile(accountId: string, requests: readonly PurchaseRequest[], signal: AbortSignal): Promise<readonly PurchaseOrder[]>;
}

export interface PurchaseConfig {
    readonly channel: PurchaseChannel;
    readonly backend: PurchaseBackend;
    /** 下游游戏可指定独立命名空间；账号隔离由恢复存储实现。 */
    readonly storageKey?: string;
    readonly operationTimeoutMs?: number;
}

/** 只保存恢复线索；存档不是发货凭证，不能凭本地状态授予权益或确认交易。 */
export interface PurchaseRecovery {
    load(accountId: string): readonly PurchaseRecoveryRequest[];
    save(accountId: string, requests: readonly PurchaseRecoveryRequest[]): void;
}
