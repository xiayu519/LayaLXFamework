import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

class FakeNode {
    active = true;
    destroyed = false;
    removeSelf = vi.fn(() => this);

    destroy(): void {
        this.destroyed = true;
    }
}

const nativePools = new Map<string, unknown[]>();
const nativePool = {
    getPoolBySign: vi.fn((sign: string) => {
        let items = nativePools.get(sign);
        if (!items) {
            items = [];
            nativePools.set(sign, items);
        }
        return items;
    }),
    getItem: vi.fn((sign: string) => nativePools.get(sign)?.pop() ?? null),
    recover: vi.fn((sign: string, item: unknown) => {
        nativePool.getPoolBySign(sign).push(item);
    }),
    clearBySign: vi.fn((sign: string) => nativePools.delete(sign)),
};
const loaderLoad = vi.fn();
vi.stubGlobal("Laya", {
    Node: FakeNode,
    Pool: nativePool,
    Loader: { HIERARCHY: "HIERARCHY" },
    loader: { load: loaderLoad },
});

const { PrefabPoolService } = await import("../../src/framework/infrastructure/pool/PrefabPoolService");

beforeEach(() => {
    nativePools.clear();
    loaderLoad.mockReset();
    vi.clearAllMocks();
});

afterAll(() => vi.unstubAllGlobals());

describe("PrefabPoolService", () => {
    it("reuses Laya.Pool nodes and rejects double or foreign returns", async () => {
        const prefab = { create: vi.fn(() => new FakeNode()) };
        loaderLoad.mockResolvedValue(prefab);
        const pool = new PrefabPoolService();
        const onRelease = vi.fn();
        pool.register({ id: "enemy", url: "prefab/enemy.lh", maxIdle: 1, onRelease });

        const first = await pool.acquire<Laya.Node>("enemy");
        pool.release("enemy", first);
        const second = await pool.acquire<Laya.Node>("enemy");

        expect(second).toBe(first);
        expect(onRelease).toHaveBeenCalledWith(first);
        expect(prefab.create).toHaveBeenCalledOnce();
        expect(nativePool.recover).toHaveBeenCalledOnce();
        pool.release("enemy", second);
        expect(() => pool.release("enemy", second)).toThrow("already released");
        expect(() => pool.release("enemy", new FakeNode() as unknown as Laya.Node)).toThrow("does not belong");
    });

    it("enforces limits and destroys nodes beyond idle capacity", async () => {
        const created: FakeNode[] = [];
        loaderLoad.mockResolvedValue({
            create: () => {
                const node = new FakeNode();
                created.push(node);
                return node;
            },
        });
        const pool = new PrefabPoolService();
        pool.register({ id: "fx", url: "prefab/fx.lh", maxIdle: 0, maxActive: 1 });

        const node = await pool.acquire<Laya.Node>("fx");
        await expect(pool.acquire("fx")).rejects.toThrow("maxActive");
        expect(() => pool.drain("fx")).toThrow("Cannot drain");

        pool.release("fx", node);
        expect(created[0].destroyed).toBe(true);
        pool.drain("fx");
        expect(pool.snapshot()[0]).toMatchObject({ active: 0, idle: 0, loading: false });
    });

    it("reserves active capacity while one shared prefab load is pending", async () => {
        let resolvePrefab!: (prefab: Laya.Prefab) => void;
        loaderLoad.mockReturnValue(new Promise((resolve) => { resolvePrefab = resolve; }));
        const pool = new PrefabPoolService();
        pool.register({ id: "bullet", url: "prefab/bullet.lh", maxIdle: 1, maxActive: 1 });

        const first = pool.acquire("bullet");
        expect(pool.snapshot()[0].pending).toBe(1);
        await expect(pool.acquire("bullet")).rejects.toThrow("maxActive");
        expect(() => pool.drain("bullet")).toThrow("pending node");

        resolvePrefab({ create: () => new FakeNode() } as unknown as Laya.Prefab);
        const node = await first;
        await pool.waitForPendingLoads();
        expect(pool.snapshot()[0]).toMatchObject({ active: 1, pending: 0, loading: false });
        pool.release("bullet", node);
    });

    it("rejects a load that completes after disposal", async () => {
        let resolvePrefab!: (prefab: Laya.Prefab) => void;
        loaderLoad.mockReturnValue(new Promise((resolve) => { resolvePrefab = resolve; }));
        const pool = new PrefabPoolService();
        pool.register({ id: "late", url: "prefab/late.lh", maxIdle: 1 });

        const acquire = pool.acquire("late");
        pool.dispose();
        resolvePrefab({ create: () => new FakeNode() } as unknown as Laya.Prefab);

        await expect(acquire).rejects.toThrow("disposed");
        await pool.waitForPendingLoads();
        expect(pool.snapshot()).toEqual([]);
    });
});
