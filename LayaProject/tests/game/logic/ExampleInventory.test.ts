import { describe, expect, it } from "vitest";
import { ExampleInventory } from "../../../src/game/logic/presentation/ui/examples/ExampleInventory";

describe("UI example inventory", () => {
    it("updates a stable item ID without removing or changing other virtual-list positions", () => {
        const inventory = new ExampleInventory();
        const before = [...inventory.items];
        expect(inventory.use("supply-90")).toBe(true);
        expect(inventory.items[89]).toEqual({ ...before[89], quantity: 2 });
        expect(inventory.items.map((item) => item.id)).toEqual(before.map((item) => item.id));
        expect(inventory.items[0]).toBe(before[0]);
        expect(before[89].quantity).toBe(3);
        expect(inventory.totalQuantity).toBe(299);
    });

    it("rejects missing or exhausted items and resets independently of other windows", () => {
        const inventory = new ExampleInventory();
        const other = new ExampleInventory();
        expect(inventory.use("missing")).toBe(false);
        for (let index = 0; index < 3; index++) expect(inventory.use("supply-1")).toBe(true);
        expect(inventory.use("supply-1")).toBe(false);
        expect(inventory.items[0].quantity).toBe(0);
        expect(other.items[0].quantity).toBe(3);
        inventory.reset();
        expect(inventory.items).toHaveLength(100);
        expect(inventory.totalQuantity).toBe(300);
    });
});
