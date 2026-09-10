import { describe, expect, it } from "vitest";
import { DataRegistry, type DataKey } from "../../src/framework/application/data/DataRegistry";

describe("DataRegistry", () => {
    it("keeps externally initialized data available to independent consumers", () => {
        const key: DataKey<{ coins: number }> = { id: "account.wallet" };
        const wallet = { coins: 40 };
        const registry = new DataRegistry([{ key, value: wallet }]);
        expect(registry.get(key)).toBe(wallet);
        wallet.coins = 75;
        expect(registry.get({ ...key }).coins).toBe(75);
    });
    it("rejects invalid composition rather than silently replacing account modules", () => {
        const entry = { key: { id: "account" }, value: {} };
        expect(() => new DataRegistry([entry, entry])).toThrow("Duplicate");
        expect(() => new DataRegistry([{ key: { id: "" }, value: {} }])).toThrow("empty");
        expect(() => new DataRegistry().get(entry.key)).toThrow("not registered");
    });
});
