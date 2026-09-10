import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

class NativeEvents {
    private readonly listeners = new Map<string, Map<object, () => void>>();
    on(event: string, caller: object, listener: () => void): this {
        if (!this.listeners.has(event)) this.listeners.set(event, new Map());
        this.listeners.get(event)!.set(caller, listener); return this;
    }
    off(event: string, caller: object): this { this.listeners.get(event)?.delete(caller); return this; }
    offAll(): this { this.listeners.clear(); return this; }
    event(event: string): void { for (const [caller, listener] of this.listeners.get(event) ?? []) listener.call(caller); }
}
const pending = new Map<object, () => void>();
const once = vi.fn((_delay: number, owner: object, callback: () => void) => { pending.set(owner, callback); });
const clearAll = vi.fn((owner: object) => { pending.delete(owner); });
vi.stubGlobal("Laya", { EventDispatcher: NativeEvents, timer: { once, clearAll } });
const { ExampleInventoryService } = await import("../../../src/game/logic/infrastructure/examples/ExampleInventoryService");
const { ExampleDeliveryService } = await import("../../../src/game/logic/infrastructure/examples/ExampleDeliveryService");
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => { pending.clear(); once.mockClear(); clearAll.mockClear(); });

function start() {
    const inventory = new ExampleInventoryService();
    const delivery = new ExampleDeliveryService(inventory);
    inventory.start(); delivery.start();
    return { inventory, delivery, stop() { delivery.stop(); inventory.stop(); } };
}
function deliver(owner: object): void { const callback = pending.get(owner)!; pending.delete(owner); callback.call(owner); }

describe("feature-owned inventory and independent server delivery", () => {
    it("commits before notifying arbitrary consumers without constructing any UI", () => {
        const app = start();
        const values: number[] = [];
        app.inventory.on(ExampleInventoryService.CHANGED, {}, () => values.push(app.inventory.totalQuantity));
        app.inventory.on(ExampleInventoryService.CHANGED, {}, () => values.push(app.inventory.totalQuantity));
        expect(app.inventory.use("supply-1")).toBe(true);
        expect(values).toEqual([299, 299]);
        app.stop();
    });

    it("keeps delivery feedback separate from inventory changes", () => {
        const app = start(), inventoryRender = vi.fn(), feedbackRender = vi.fn();
        app.inventory.on(ExampleInventoryService.CHANGED, {}, inventoryRender);
        app.delivery.on(ExampleDeliveryService.CHANGED, {}, feedbackRender);
        app.delivery.scheduleReward();
        app.delivery.scheduleReward();
        expect(once).toHaveBeenCalledOnce();
        expect(feedbackRender).toHaveBeenCalledOnce();
        expect(inventoryRender).not.toHaveBeenCalled();
        deliver(app.delivery);
        expect(inventoryRender).toHaveBeenCalledOnce();
        expect(feedbackRender).toHaveBeenCalledTimes(2);
        expect(app.inventory.totalQuantity).toBe(305);
        expect(app.delivery.rewardPending).toBe(false);
        app.stop();
    });

    it("updates account state while all inventory UI subscribers are closed", () => {
        const app = start(), owner = {}, render = vi.fn();
        app.inventory.on(ExampleInventoryService.CHANGED, owner, render);
        app.delivery.scheduleReward();
        app.inventory.off(ExampleInventoryService.CHANGED, owner);
        deliver(app.delivery);
        expect(render).not.toHaveBeenCalled();
        expect(app.inventory.snapshot().items[0].quantity).toBe(8);
        expect(app.inventory.totalQuantity).toBe(305);
        app.stop();
    });

    it("isolates accounts and rejects timer callbacks and protocol results after shutdown", () => {
        const first = start(), second = start();
        first.delivery.scheduleReward(); second.delivery.scheduleReward();
        const late = pending.get(first.delivery)!;
        first.stop(); late();
        expect(first.inventory.totalQuantity).toBe(300);
        expect(first.inventory.applySnapshot({ version: 2, items: [] })).toBe("invalid");
        expect(pending.has(first.delivery)).toBe(false);
        deliver(second.delivery);
        expect(second.inventory.totalQuantity).toBe(305);
        second.stop();
    });

    it("ignores old packets without refreshing inventory and resets pending demo delivery explicitly", () => {
        const app = start();
        app.inventory.use("supply-50");
        app.delivery.rebuildFromServer();
        const current = app.inventory.snapshot(), render = vi.fn();
        app.inventory.on(ExampleInventoryService.CHANGED, {}, render);
        app.delivery.replayPreviousResponse();
        expect(app.inventory.snapshot()).toEqual(current);
        expect(render).not.toHaveBeenCalled();
        app.delivery.scheduleReward();
        app.delivery.reset();
        expect(pending.has(app.delivery)).toBe(false);
        expect(app.inventory.totalQuantity).toBe(300);
        app.stop();
    });

    it("rejects gaps and invalid patches without exposing partial state or emitting changes", () => {
        const app = start(), render = vi.fn();
        app.inventory.on(ExampleInventoryService.CHANGED, {}, render);
        expect(app.inventory.applyPatch({ version: 9, baseVersion: 8, upserts: [], removedIds: ["supply-1"] }))
            .toBe("base-mismatch");
        expect(app.inventory.applySnapshot({ version: 10, items: [{ id: "bad", quantity: -2 }] })).toBe("invalid");
        expect(render).not.toHaveBeenCalled();
        expect(app.inventory.version).toBe(1);
        expect(app.inventory.totalQuantity).toBe(300);
        app.stop();
    });
});
