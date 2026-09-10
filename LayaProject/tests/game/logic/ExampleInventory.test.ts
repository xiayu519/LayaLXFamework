import { describe, expect, it } from "vitest";
import { ExampleInventory, createExampleItems } from "../../../src/game/logic/domain/ExampleInventory";

describe("independent account inventory", () => {
    it("starts empty and only contains data after a login snapshot arrives", () => {
        const inventory = new ExampleInventory();
        expect(inventory.snapshot()).toEqual({ version: 0, items: [] });
        expect(inventory.totalQuantity).toBe(0);
        expect(inventory.applySnapshot({ version: 1, items: createExampleItems() })).toBe("applied");
        expect(inventory.items).toHaveLength(100);
        expect(inventory.totalQuantity).toBe(300);
    });

    it("updates stable item IDs without changing other virtual-list positions or another account", () => {
        const inventory = new ExampleInventory(), other = new ExampleInventory();
        inventory.applySnapshot({ version: 1, items: createExampleItems() });
        other.applySnapshot({ version: 1, items: createExampleItems() });
        const before = [...inventory.items];
        expect(inventory.applyPatch({ version: 2, baseVersion: 1,
            upserts: [{ ...before[89], quantity: 2 }], removedIds: [] })).toBe("applied");
        expect(inventory.items[89]).toEqual({ ...before[89], quantity: 2 });
        expect(inventory.items.map(item => item.id)).toEqual(before.map(item => item.id));
        expect(inventory.items[0]).toBe(before[0]);
        expect(before[89].quantity).toBe(3);
        expect(inventory.totalQuantity).toBe(299);
        expect(other.totalQuantity).toBe(300);
    });
});
