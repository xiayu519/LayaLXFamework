/** 订单状态来自可信的订单接入方；渠道回调本身不能决定发货。 */
export type PurchaseStatus = "awaiting-payment" | "awaiting-delivery" | "delivered" | "cancelled" | "failed" | "revoked";

/** 请求号在发起下单前保存，超时后以同一请求号查询，不能重新生成订单。 */
export interface PurchaseRequest {
    readonly accountId: string;
    readonly requestId: string;
    readonly productId: string;
}

export interface PurchaseRecoveryRequest extends PurchaseRequest {
    /** 拉起渠道前先保存；恢复查询不会自动再次扣款。 */
    readonly launched: boolean;
}

export interface PurchaseTransactionId {
    readonly channel: string;
    readonly transactionId: string;
}

export interface PurchaseTransaction extends PurchaseTransactionId {
    readonly accountId: string;
    readonly productId: string;
    readonly orderId?: string;
    /** 仅在渠道和校验接入边界传递，不保存或输出收据内容。 */
    readonly evidence?: unknown;
}

export interface PurchaseOrder extends PurchaseRequest {
    readonly orderId: string;
    /** 同一订单单调递增；相同版本必须表示相同业务状态。 */
    readonly revision: number;
    readonly status: PurchaseStatus;
    readonly transaction?: PurchaseTransactionId;
    readonly confirmation: "none" | "required" | "complete";
}

export interface PurchaseAttempt {
    readonly status: "pending" | "submitted" | "cancelled" | "failed";
    readonly transaction?: PurchaseTransaction;
}

/** 公共事件由 lx.events 原生派发；订阅归实际消费它的 World 或界面。 */
export class PurchaseEvent {
    public static readonly CHANGED = "lx:purchase:changed";
    public static readonly ERROR = "lx:purchase:error";
    public static readonly ACCOUNT_CHANGED = "lx:purchase:account-changed";

    private constructor() {
    }
}

export interface PurchaseFailure {
    readonly accountId?: string;
    readonly operation: string;
    readonly error: unknown;
}

export class PurchaseError extends Error {
    public constructor(public readonly kind: "unavailable" | "inactive" | "account" | "timeout" | "protocol" | "capacity" | "pending",
        message: string) {
        super(message);
        this.name = "PurchaseError";
    }
}

export function isPurchaseRequest(value: unknown): value is PurchaseRequest {
    if (!value || typeof value !== "object") {
        return false;
    }
    const item = value as Partial<PurchaseRequest>;
    return nonempty(item.accountId) && nonempty(item.requestId) && nonempty(item.productId);
}

export function isPurchaseOrder(value: unknown): value is PurchaseOrder {
    if (!isPurchaseRequest(value)) {
        return false;
    }
    const item = value as Partial<PurchaseOrder>;
    return nonempty(item.orderId) && Number.isSafeInteger(item.revision) && item.revision! >= 0
        && ["awaiting-payment", "awaiting-delivery", "delivered", "cancelled", "failed", "revoked"].includes(item.status!)
        && ["none", "required", "complete"].includes(item.confirmation!)
        && (item.transaction === undefined || Boolean(item.transaction && nonempty(item.transaction.channel)
            && nonempty(item.transaction.transactionId)))
        && (item.confirmation === "none" || Boolean(item.transaction));
}

export function needsPurchaseRecovery(order: PurchaseOrder): boolean {
    return order.status === "awaiting-payment" || order.status === "awaiting-delivery"
        || order.status === "delivered" && order.confirmation === "required";
}

function nonempty(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}
