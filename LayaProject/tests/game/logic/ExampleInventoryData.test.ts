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
const { ExampleInventoryData } = await import("../../../src/game/logic/infrastructure/examples/ExampleInventoryData");
const { ExampleInventory } = await import("../../../src/game/logic/domain/ExampleInventory");
const { ExampleDeliveryService } = await import("../../../src/game/logic/infrastructure/examples/ExampleDeliveryService");
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => { pending.clear(); once.mockClear(); clearAll.mockClear(); });

function start() {
    const inventory = new ExampleInventoryData(new ExampleInventory());
    const receiver = inventory.createReceiver();
    const delivery = new ExampleDeliveryService(new ExampleInventory(), receiver);
    delivery.start();
    return { inventory, delivery, receiver, stop() { delivery.stop(); inventory.dispose(); } };
}
function deliver(owner: object): void { const callback = pending.get(owner)!; pending.delete(owner); callback.call(owner); }

describe("feature-owned inventory and independent server delivery", () => {
    it("accepts login packets before any service or World exists and invalidates old-account receivers", () => {
        const inventory = new ExampleInventoryData(new ExampleInventory());
        const stale = inventory.createReceiver();
        const observed: number[] = [];
        inventory.on(ExampleInventoryData.CHANGED, {}, () => observed.push(inventory.totalQuantity));
        expect(inventory.totalQuantity).toBe(0);
        expect(stale.applySnapshot({ version: 1, items: [{ id: "login", name: "Login", quantity: 9 }] })).toBe("applied");
        expect(observed).toEqual([9]);
        inventory.clear();
        const current = inventory.createReceiver();
        expect(stale.applySnapshot({ version: 99, items: [] })).toBe("invalid");
        expect(stale.applyPatch({ version: 2, baseVersion: 1, upserts: [], removedIds: [] })).toBe("invalid");
        expect(current.applySnapshot({ version: 1, items: [{ id: "new", name: "New", quantity: 2 }] })).toBe("applied");
        expect(observed).toEqual([9, 0, 2]);
        inventory.dispose();
    });

    it("rejects missing and exhausted commands without changing another account", () => {
        const first = start(), second = start();
        expect(first.delivery.use("missing")).toBe(false);
        for (let index = 0; index < 3; index++) expect(first.delivery.use("supply-1")).toBe(true);
        const snapshot = first.inventory.snapshot();
        expect(first.delivery.use("supply-1")).toBe(false);
        expect(first.inventory.snapshot()).toEqual(snapshot);
        expect(first.inventory.items[0].quantity).toBe(0);
        expect(second.inventory.items[0].quantity).toBe(3);
        first.stop(); second.stop();
    });

    it("commits before notifying arbitrary consumers without constructing any UI", () => {
        const app = start();
        const values: number[] = [];
        app.inventory.on(ExampleInventoryData.CHANGED, {}, () => values.push(app.inventory.totalQuantity));
        app.inventory.on(ExampleInventoryData.CHANGED, {}, () => values.push(app.inventory.totalQuantity));
        expect(app.delivery.use("supply-1")).toBe(true);
        expect(values).toEqual([299, 299]);
        app.stop();
    });

    it("keeps delivery feedback separate from inventory changes", () => {
        const app = start(), inventoryRender = vi.fn(), feedbackRender = vi.fn();
        app.inventory.on(ExampleInventoryData.CHANGED, {}, inventoryRender);
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
        app.inventory.on(ExampleInventoryData.CHANGED, owner, render);
        app.delivery.scheduleReward();
        app.inventory.off(ExampleInventoryData.CHANGED, owner);
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
        expect(first.inventory.totalQuantity).toBe(0);
        expect(first.receiver.applySnapshot({ version: 2, items: [] })).toBe("invalid");
        expect(pending.has(first.delivery)).toBe(false);
        deliver(second.delivery);
        expect(second.inventory.totalQuantity).toBe(305);
        second.stop();
    });

    it("ignores old packets without refreshing inventory and resets pending demo delivery explicitly", () => {
        const app = start();
        app.delivery.use("supply-50");
        app.delivery.rebuildFromServer();
        const current = app.inventory.snapshot(), render = vi.fn();
        app.inventory.on(ExampleInventoryData.CHANGED, {}, render);
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
        app.inventory.on(ExampleInventoryData.CHANGED, {}, render);
        expect(app.receiver.applyPatch({ version: 9, baseVersion: 8, upserts: [], removedIds: ["supply-1"] }))
            .toBe("base-mismatch");
        expect(app.receiver.applySnapshot({ version: 10, items: [{ id: "bad", quantity: -2 }] })).toBe("invalid");
        expect(render).not.toHaveBeenCalled();
        expect(app.inventory.version).toBe(1);
        expect(app.inventory.totalQuantity).toBe(300);
        app.stop();
    });
});
