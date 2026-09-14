import { vi } from "vitest";
import type { PurchaseBackend, PurchaseChannel, PurchaseConfig } from "../../../src/framework/domain/purchase/PurchaseContracts";
import type { PurchaseAttempt, PurchaseOrder, PurchaseRequest, PurchaseTransaction } from "../../../src/framework/domain/purchase/PurchaseTypes";

/** 测试侧权威状态独立保存，渠道成功不会直接修改权益。 */
export class TestPurchaseBackend implements PurchaseBackend {
    public readonly orders = new Map<string, PurchaseOrder>();
    public readonly balances = new Map<string, number>();
    private readonly granted = new Set<string>();
    private sequence = 0;

    public readonly createOrder = vi.fn(async (request: PurchaseRequest, _signal: AbortSignal) => {
        const existing = [...this.orders.values()].find(order => order.requestId === request.requestId && order.accountId === request.accountId);
        if (existing) return { order: existing, channelData: { test: true } };
        const order: PurchaseOrder = { ...request, orderId: `order-${++this.sequence}`, status: "awaiting-payment", confirmation: "none", revision: 0 };
        this.orders.set(order.orderId, order);
        return { order, channelData: { test: true } };
    });

    public readonly reportAttempt = vi.fn(async (order: PurchaseOrder, attempt: PurchaseAttempt, _signal: AbortSignal) => {
        const current = this.orders.get(order.orderId)!;
        if (current.status === "delivered") return current;
        const updated: PurchaseOrder = { ...current, revision: current.revision + 1,
            status: attempt.status === "submitted" ? "awaiting-delivery" : attempt.status === "pending" ? "awaiting-payment" : attempt.status };
        this.orders.set(updated.orderId, updated);
        return updated;
    });

    public readonly reconcile = vi.fn(async (accountId: string, _requests: readonly PurchaseRequest[], _signal: AbortSignal): Promise<readonly PurchaseOrder[]> =>
        [...this.orders.values()].filter(order => order.accountId === accountId));

    public readonly verifyTransaction = vi.fn(async (transaction: PurchaseTransaction, _signal: AbortSignal): Promise<PurchaseOrder> => {
        const order = this.orders.get(transaction.orderId!);
        if (!order) throw new Error("Transaction is not verified.");
        return order;
    });

    public deliver(orderId: string, confirmation: PurchaseOrder["confirmation"] = "none"): PurchaseOrder {
        const previous = this.orders.get(orderId)!;
        const order: PurchaseOrder = { ...previous, revision: previous.revision + 1, status: "delivered", confirmation,
            transaction: { channel: "test", transactionId: `transaction-${orderId}` } };
        this.orders.set(orderId, order);
        if (!this.granted.has(orderId)) {
            this.granted.add(orderId);
            this.balances.set(order.accountId, (this.balances.get(order.accountId) ?? 0) + 10);
        }
        return order;
    }
}

export class TestPurchaseChannel implements PurchaseChannel {
    public listener?: (transaction: PurchaseTransaction) => void;
    public readonly start = vi.fn((listener: (transaction: PurchaseTransaction) => void, _signal: AbortSignal) => { this.listener = listener; });
    public readonly stop = vi.fn(async () => { this.listener = undefined; });
    public readonly launch = vi.fn(async (_order: PurchaseOrder, _data: unknown, _signal: AbortSignal): Promise<PurchaseAttempt> => ({ status: "submitted" }));
    public readonly recover = vi.fn(async (_accountId: string, _signal: AbortSignal): Promise<readonly PurchaseTransaction[]> => []);
    public readonly finish = vi.fn(async () => {});

    public notify(order: PurchaseOrder): void {
        this.listener?.({ ...order.transaction!, accountId: order.accountId, productId: order.productId, orderId: order.orderId });
    }
}

export function purchaseFixture(): { config: PurchaseConfig; channel: TestPurchaseChannel; backend: TestPurchaseBackend } {
    const channel = new TestPurchaseChannel(), backend = new TestPurchaseBackend();
    return { channel, backend, config: { channel, backend, storageKey: "test.purchase", operationTimeoutMs: 100 } };
}
