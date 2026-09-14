import { describe, expect, it } from "vitest";
import { PurchaseRecoveryStore } from "../../src/framework/infrastructure/storage/PurchaseRecoveryStore";

function fixture() {
    const data = new Map<string, string>();
    const store = new PurchaseRecoveryStore({ getItem: key => data.get(key) ?? null,
        setItem: (key, value) => { data.set(key, value); }, removeItem: key => { data.delete(key); } });
    return { store, data };
}

describe("支付恢复存储", () => {
    it("按账号隔离并只保存恢复线索", () => {
        const { store, data } = fixture();
        const request = { accountId: "A", requestId: "request", productId: "gems", launched: true };
        store.save("A", [request]);
        expect(store.load("A")).toEqual([request]);
        expect(store.load("B")).toEqual([]);
        expect(() => store.save("B", [request])).toThrow("invalid data");
        expect(data.get("lx.purchase:A")).not.toContain("receipt");
    });

    it.each(["broken-json", JSON.stringify({ version: 1, data: [{ accountId: "B" }] }),
        JSON.stringify({ version: 2, data: [] }), JSON.stringify({ version: 1, data: [
            { accountId: "A", requestId: "r", productId: "gems", launched: true },
            { accountId: "A", requestId: "r", productId: "gems", launched: true },
        ] })])("损坏、未来版本或重复请求不被覆盖：%s", original => {
        const { store, data } = fixture();
        data.set("lx.purchase:A", original);
        expect(() => store.load("A")).toThrow();
        expect(() => store.save("A", [])).toThrow();
        expect(data.get("lx.purchase:A")).toBe(original);
    });
});
