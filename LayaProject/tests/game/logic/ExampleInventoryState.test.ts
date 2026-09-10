import { describe, expect, it } from "vitest";
import { ExampleInventory } from "../../../src/game/logic/domain/ExampleInventory";

const item = { id: "new-item", name: "新补给", quantity: 9 };

describe("account inventory snapshots and patches", () => {
    it("rebuilds from a full server snapshot and does not retain removed entries", () => {
        const inventory = new ExampleInventory();
        expect(inventory.applySnapshot({ version: 10, items: [item] })).toBe("applied");
        expect(inventory.snapshot()).toEqual({ version: 10, items: [item] });
        expect(inventory.totalQuantity).toBe(9);
        expect(inventory.use("supply-1")).toBe(false);
    });

    it("ignores duplicate or out-of-order snapshots without replacing the current array", () => {
        const inventory = new ExampleInventory();
        inventory.applySnapshot({ version: 10, items: [item] });
        const current = inventory.items;
        for (const version of [10, 9, 1]) {
            expect(inventory.applySnapshot({ version, items: [] })).toBe("stale");
            expect(inventory.items).toBe(current);
            expect(inventory.version).toBe(10);
        }
    });

    it.each([
        null, {}, { version: 0, items: [] }, { version: 2.5, items: [] },
        { version: Number.MAX_SAFE_INTEGER + 1, items: [] },
        { version: 2, items: [item, item] },
        { version: 2, items: [{ ...item, quantity: -1 }] },
        { version: 2, items: [{ ...item, quantity: 1.5 }] },
        { version: 2, items: [{ ...item, quantity: Infinity }] },
        { version: 2, items: [{ ...item, quantity: "9" }] },
        { version: 2, items: [{ ...item, id: "" }] },
        { version: 2, items: [{ ...item, name: "  " }] },
    ])("rejects malformed snapshots atomically: %j", payload => {
        const inventory = new ExampleInventory();
        const before = inventory.snapshot();
        expect(inventory.applySnapshot(payload)).toBe("invalid");
        expect(inventory.items).toBe(before.items);
        expect(inventory.version).toBe(before.version);
    });

    it("applies add/change/remove together, retaining unchanged item identity and order", () => {
        const inventory = new ExampleInventory();
        const before = inventory.items;
        expect(inventory.applyPatch({ version: 2, baseVersion: 1,
            upserts: [{ ...before[1], quantity: 7 }, item], removedIds: [before[0].id] })).toBe("applied");
        expect(inventory.items[0]).toEqual({ ...before[1], quantity: 7 });
        expect(inventory.items[1]).toBe(before[2]);
        expect(inventory.items[inventory.items.length - 1]).toEqual(item);
        expect(inventory.items).toHaveLength(100);
        expect(inventory.totalQuantity).toBe(310);
    });

    it("requires a patch's exact base, ignores repeat delivery and recovers through a snapshot", () => {
        const inventory = new ExampleInventory();
        const patch = { version: 5, baseVersion: 4, upserts: [item], removedIds: [] };
        expect(inventory.applyPatch(patch)).toBe("base-mismatch");
        expect(inventory.totalQuantity).toBe(300);
        expect(inventory.applySnapshot({ version: 4, items: [] })).toBe("applied");
        expect(inventory.applyPatch(patch)).toBe("applied");
        expect(inventory.applyPatch(patch)).toBe("stale");
        expect(inventory.totalQuantity).toBe(9);
    });

    it("rejects invalid/conflicting patches before any writes", () => {
        const inventory = new ExampleInventory();
        const before = inventory.items;
        for (const patch of [
            { version: 2, baseVersion: 1, upserts: [item, item], removedIds: [] },
            { version: 2, baseVersion: 1, upserts: [item], removedIds: [item.id] },
            { version: 2, baseVersion: 1, upserts: [item], removedIds: ["supply-1", "supply-1"] },
            { version: 2, baseVersion: 2, upserts: [item], removedIds: [] },
            { version: 2, baseVersion: 1, upserts: [item, { ...item, id: "bad", quantity: -1 }], removedIds: [] },
        ]) {
            expect(inventory.applyPatch(patch)).toBe("invalid");
            expect(inventory.items).toBe(before);
            expect(inventory.version).toBe(1);
        }
    });

    it("owns immutable copies of accepted data and strips unrelated response fields", () => {
        const inventory = new ExampleInventory();
        const external = { ...item, extra: { mutable: true } };
        inventory.applySnapshot({ version: 2, items: [external] });
        external.quantity = 0;
        expect(inventory.items[0]).toEqual(item);
        expect(Object.isFrozen(inventory.items)).toBe(true);
        expect(Object.isFrozen(inventory.items[0])).toBe(true);
        inventory.applyPatch({ version: 3, baseVersion: 2, upserts: [{ ...external, quantity: 6 }], removedIds: [] });
        expect(inventory.items[0]).toEqual({ ...item, quantity: 6 });
        expect(Object.isFrozen(inventory.items[0])).toBe(true);
    });

    it("accepts an empty snapshot and keeps explicitly reset state isolated per account", () => {
        const first = new ExampleInventory();
        const second = new ExampleInventory();
        first.applySnapshot({ version: 20, items: [] });
        expect(first.items).toHaveLength(0);
        expect(first.use("supply-1")).toBe(false);
        first.reset();
        expect(first.version).toBe(21);
        expect(first.totalQuantity).toBe(300);
        expect(second.version).toBe(1);
        expect(second.items).not.toBe(first.items);
    });
});
