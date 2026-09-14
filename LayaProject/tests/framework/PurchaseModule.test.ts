import { afterEach, describe, expect, it, vi } from "vitest";
import { PurchaseModule } from "../../src/framework/application/purchase/PurchaseModule";
import { PurchaseRecoveryStore } from "../../src/framework/infrastructure/storage/PurchaseRecoveryStore";
import { PurchaseEvent, type PurchaseOrder } from "../../src/framework/domain/purchase/PurchaseTypes";
import { purchaseFixture } from "./fixtures/purchase-fixtures";

const active: PurchaseModule[] = [];
afterEach(async () => {
    vi.useRealTimers();
    await Promise.all(active.splice(0).map(module => module.stop()));
});

async function fixture() {
    const parts = purchaseFixture();
    const memory = new Map<string, string>();
    const driver = { getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => { memory.set(key, value); }, removeItem: (key: string) => { memory.delete(key); } };
    const recovery = new PurchaseRecoveryStore(driver, "test.purchase");
    const publish = vi.fn();
    const create = () => {
        const module = new PurchaseModule(parts.config, recovery, publish);
        active.push(module);
        return module;
    };
    const module = create();
    await module.start();
    module.setAccount("A");
    return { ...parts, module, memory, recovery, publish, create, driver };
}

describe("根支付流程", () => {
    it("未接入时正常启停且不能购买", async () => {
        const recovery = { load: vi.fn(() => []), save: vi.fn() };
        const module = new PurchaseModule(undefined, recovery, vi.fn());
        await module.start();
        expect(module.supported).toBe(false);
        await expect(module.buy("gems")).rejects.toMatchObject({ kind: "unavailable" });
        expect(await module.reconcile()).toEqual([]);
        expect(recovery.load).not.toHaveBeenCalled();
        await module.stop();
    });

    it("渠道成功只进入等待到账，同次点击合并，重复通知只确认一次", async () => {
        const { module, backend, channel, publish, recovery } = await fixture();
        const first = module.buy("gems");
        expect(module.buy("gems")).toBe(first);
        const order = await first;
        expect(order.status).toBe("awaiting-delivery");
        expect(backend.balances.get("A")).toBeUndefined();
        expect(channel.launch).toHaveBeenCalledOnce();
        const delivered = backend.deliver(order.orderId, "required");
        channel.notify(delivered);
        channel.notify(delivered);
        await vi.waitFor(() => expect(module.getOrder(order.orderId)?.confirmation).toBe("complete"));
        channel.notify(delivered);
        await module.reconcile();
        expect(channel.finish).toHaveBeenCalledOnce();
        expect(backend.balances.get("A")).toBe(10);
        expect(recovery.load("A")).toEqual([]);
        const completed = publish.mock.calls.filter(([event, value]) => event === PurchaseEvent.CHANGED
            && (value as PurchaseOrder).confirmation === "complete");
        expect(completed).toHaveLength(1);
    });

    it.each(["pending", "cancelled", "failed"] as const)("正确处理渠道 %s，终态由订单接入方确认", async status => {
        const { module, backend, channel, recovery } = await fixture();
        channel.launch.mockResolvedValue({ status });
        const order = await module.buy("gems");
        expect(order.status).toBe(status === "pending" ? "awaiting-payment" : status);
        expect(recovery.load("A")).toHaveLength(status === "pending" ? 1 : 0);
        expect(backend.balances.size).toBe(0);
        expect(channel.finish).not.toHaveBeenCalled();
    });

    it("确认失败保留恢复记录，重启后先向后端查询再重试确认", async () => {
        const { module, backend, channel, recovery, create } = await fixture();
        const order = await module.buy("gems");
        backend.deliver(order.orderId, "required");
        channel.finish.mockRejectedValueOnce(new Error("finish unavailable"));
        await expect(module.reconcile()).rejects.toThrow("unresolved");
        expect(recovery.load("A")).toHaveLength(1);
        await module.stop();
        const restarted = create();
        await restarted.start();
        restarted.setAccount("A");
        expect(restarted.getOrder(order.orderId)).toBeUndefined();
        await restarted.reconcile();
        expect(restarted.getOrder(order.orderId)?.confirmation).toBe("complete");
        expect(channel.finish).toHaveBeenCalledTimes(2);
        expect(channel.launch).toHaveBeenCalledOnce();
        expect(backend.balances.get("A")).toBe(10);
    });

    it("下单超时保留原请求号，重试不会另建订单", async () => {
        const { module, backend, channel, recovery } = await fixture();
        const original = backend.createOrder.getMockImplementation()!;
        backend.createOrder.mockImplementationOnce(async (request, signal) => {
            await original(request, signal);
            return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
        });
        await expect(module.buy("gems")).rejects.toMatchObject({ kind: "timeout" });
        const saved = recovery.load("A")[0];
        expect(saved.launched).toBe(false);
        const order = await module.buy("gems");
        expect(order.requestId).toBe(saved.requestId);
        expect(backend.orders.size).toBe(1);
        expect(channel.launch).toHaveBeenCalledOnce();
    });

    it("拉起后超时不会重新扣款，后续查询仍可到账", async () => {
        const { module, backend, channel } = await fixture();
        channel.launch.mockImplementationOnce((_order, _data, signal) => new Promise((_, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        }));
        await expect(module.buy("gems")).rejects.toMatchObject({ kind: "timeout" });
        const order = await module.buy("gems");
        expect(order.status).toBe("awaiting-payment");
        expect(channel.launch).toHaveBeenCalledOnce();
        backend.deliver(order.orderId);
        await module.reconcile();
        expect(module.getOrder(order.orderId)?.status).toBe("delivered");
    });

    it("换账号后丢弃晚到结果，恢复原账号时继续处理原订单", async () => {
        const { module, backend, channel, publish, recovery } = await fixture();
        const order = await module.buy("gems");
        const delivered = backend.deliver(order.orderId);
        let finish!: (orders: readonly PurchaseOrder[]) => void;
        backend.reconcile.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const checking = module.reconcile();
        const rejected = expect(checking).rejects.toThrow();
        await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
        module.setAccount("B");
        await rejected;
        publish.mockClear();
        finish([delivered]);
        channel.notify(delivered);
        await module.reconcile();
        expect(module.snapshot().orders).toEqual([]);
        expect(recovery.load("A")).toHaveLength(1);
        expect(publish).not.toHaveBeenCalled();
        module.setAccount("A");
        await module.reconcile();
        expect(module.getOrder(order.orderId)?.status).toBe("delivered");
    });

    it("重复及乱序快照不倒退，事务不能归属两个订单", async () => {
        const { module, backend } = await fixture();
        const pending = await module.buy("gems");
        const delivered = backend.deliver(pending.orderId);
        await module.reconcile();
        backend.reconcile.mockResolvedValueOnce([pending]);
        await module.reconcile();
        expect(module.getOrder(pending.orderId)?.status).toBe("delivered");
        backend.reconcile.mockResolvedValueOnce([{ ...delivered, orderId: "other-order", requestId: "other-request" }]);
        await expect(module.reconcile()).rejects.toThrow("unresolved");
        expect(module.getOrder("other-order")).toBeUndefined();
    });

    it("本地没有请求记录时也能发现服务端订单，恢复不再次拉起渠道", async () => {
        const { module, backend, channel, recovery } = await fixture();
        const prepared = await backend.createOrder({ accountId: "A", productId: "gems", requestId: "server-only" }, new AbortController().signal);
        const delivered = backend.deliver(prepared.order.orderId, "required");
        expect(recovery.load("A")).toEqual([]);
        await module.reconcile();
        expect(module.getOrder(delivered.orderId)).toMatchObject({ status: "delivered", confirmation: "complete" });
        expect(channel.launch).not.toHaveBeenCalled();
        expect(channel.finish).toHaveBeenCalledOnce();
        expect(recovery.load("A")).toEqual([]);
    });

    it("拒绝相同版本的冲突，撤销必须有新版本且不能重新变成已发货", async () => {
        const { module, backend, channel } = await fixture();
        const pending = await module.buy("gems");
        const delivered = backend.deliver(pending.orderId);
        await module.reconcile();
        backend.reconcile.mockResolvedValueOnce([{ ...delivered, status: "revoked" }]);
        await expect(module.reconcile()).rejects.toThrow("unresolved");
        expect(module.getOrder(pending.orderId)?.status).toBe("delivered");
        backend.reconcile.mockResolvedValueOnce([{ ...delivered, revision: delivered.revision + 1, status: "revoked" }]);
        await module.reconcile();
        backend.reconcile.mockResolvedValueOnce([{ ...delivered, revision: delivered.revision + 2 }]);
        await expect(module.reconcile()).rejects.toThrow("unresolved");
        expect(module.getOrder(pending.orderId)?.status).toBe("revoked");
        expect(channel.finish).not.toHaveBeenCalled();
    });

    it("监听抛错不打断受理和确认，未验证的交易只报告错误", async () => {
        const { module, backend, channel, publish } = await fixture();
        const { logger } = await import("../../src/framework/application/diagnostics/Logger");
        const logged = vi.spyOn(logger, "error").mockImplementation(() => {});
        publish.mockImplementation(() => { throw new Error("view destroyed"); });
        try {
            const order = await module.buy("gems");
            backend.deliver(order.orderId, "required");
            await module.reconcile();
            expect(channel.finish).toHaveBeenCalledOnce();
            expect(logged).toHaveBeenCalled();
            publish.mockReset();
            channel.listener!({ accountId: "A", productId: "gems", channel: "test", transactionId: "unverified" });
            await vi.waitFor(() => expect(publish).toHaveBeenCalledWith(PurchaseEvent.ERROR,
                expect.objectContaining({ operation: "transaction" })));
        } finally { logged.mockRestore(); }
    });

    it("存储失败时不拉起支付，原恢复记录保持可读", async () => {
        const { module, channel, driver, recovery } = await fixture();
        const writing = vi.spyOn(driver, "setItem").mockImplementationOnce(() => { throw new Error("disk full"); });
        await expect(module.buy("gems")).rejects.toThrow("failed");
        expect(channel.launch).not.toHaveBeenCalled();
        expect(recovery.load("A")).toEqual([]);
        writing.mockRestore();
    });

    it("停机阻止回写并等待接入方收尾，过期渠道监听不会处理新会话", async () => {
        const { module, backend, channel, publish, create } = await fixture();
        const order = await module.buy("gems");
        const oldListener = channel.listener!;
        const delivered = backend.deliver(order.orderId);
        let finish!: (orders: readonly PurchaseOrder[]) => void;
        backend.reconcile.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const checking = module.reconcile();
        const rejected = expect(checking).rejects.toThrow();
        await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
        const stopping = module.stop();
        expect(module.stop()).toBe(stopping);
        await rejected;
        expect(module.snapshot().running).toBe(false);
        finish([delivered]);
        await stopping;
        expect(module.snapshot().pendingOperations).toBe(0);
        const restarted = create();
        await restarted.start();
        restarted.setAccount("A");
        publish.mockClear();
        oldListener({ ...delivered.transaction!, accountId: "A", productId: "gems", orderId: delivered.orderId });
        await Promise.resolve();
        expect(publish).not.toHaveBeenCalled();
    });
});
