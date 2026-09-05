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

    it("isolates destroy failures and retries nodes that have not entered native destruction", async () => {
        loaderLoad.mockResolvedValue({ create: () => new FakeNode() });
        const pool = new PrefabPoolService();
        pool.register({ id: "one", url: "one.lh", maxIdle: 1 });
        pool.register({ id: "two", url: "two.lh", maxIdle: 1 });
        const failed = await pool.acquire("one") as unknown as FakeNode;
        const other = await pool.acquire("one") as unknown as FakeNode;
        const idle = await pool.acquire("two") as unknown as FakeNode;
        pool.release("two", idle as unknown as Laya.Node);
        const destroy = vi.spyOn(failed, "destroy").mockImplementationOnce(() => { throw new Error("destroy failed"); });
        expect(() => pool.dispose()).toThrow("clean up");
        expect(other.destroyed).toBe(true);
        expect(idle.destroyed).toBe(true);
        expect(pool.snapshot()[0].cleanupFailures).toBe(1);
        expect(pool.cleanupDiagnostics()).toEqual([
            expect.objectContaining({ poolId: "one", attempts: 1, retryable: true }),
        ]);
        expect(() => pool.dispose()).not.toThrow();
        expect(destroy).toHaveBeenCalledTimes(2);
        expect(pool.snapshot()).toEqual([]);
    });

    it("keeps a partial native destruction visible and never silently succeeds on retry", async () => {
        loaderLoad.mockResolvedValue({ create: () => new FakeNode() });
        const pool = new PrefabPoolService();
        pool.register({ id: "partial", url: "partial.lh", maxIdle: 1 });
        const partial = await pool.acquire("partial") as unknown as FakeNode;
        const other = await pool.acquire("partial") as unknown as FakeNode;
        const destroy = vi.spyOn(partial, "destroy").mockImplementation(() => {
            partial.destroyed = true;
            throw new Error("onDisable failed after destroyed flag");
        });
        expect(() => pool.dispose()).toThrow("clean up");
        expect(other.destroyed).toBe(true);
        expect(() => pool.dispose()).toThrow("clean up");
        expect(destroy).toHaveBeenCalledOnce();
        expect(pool.cleanupDiagnostics()).toEqual([
            expect.objectContaining({ poolId: "partial", attempts: 1, retryable: false }),
        ]);
    });

    it("drains remaining idle nodes even if the first idle destruction fails", async () => {
        loaderLoad.mockResolvedValue({ create: () => new FakeNode() });
        const pool = new PrefabPoolService();
        pool.register({ id: "idle", url: "idle.lh", maxIdle: 2 });
        const good = await pool.acquire("idle") as unknown as FakeNode;
        const failed = await pool.acquire("idle") as unknown as FakeNode;
        pool.release("idle", good as unknown as Laya.Node);
        pool.release("idle", failed as unknown as Laya.Node);
        vi.spyOn(failed, "destroy").mockImplementationOnce(() => { throw new Error("idle destroy failed"); });
        expect(() => pool.drain("idle")).toThrow("clean up");
        expect(good.destroyed).toBe(true);
        expect(pool.snapshot()[0]).toMatchObject({ idle: 0, cleanupFailures: 1 });
        expect(() => pool.drain("idle")).not.toThrow();
        expect(failed.destroyed).toBe(true);
    });

    it("does not return a destroyed acquisition or recover a node after a reset callback disposes the service", async () => {
        loaderLoad.mockResolvedValue({ create: () => new FakeNode() });
        const acquiring = new PrefabPoolService();
        acquiring.register({ id: "acquire-stop", url: "one.lh", maxIdle: 1, onAcquire: () => acquiring.dispose() });
        await expect(acquiring.acquire("acquire-stop")).rejects.toThrow("disposed");
        const releasing = new PrefabPoolService();
        releasing.register({ id: "release-stop", url: "two.lh", maxIdle: 1, onRelease: () => releasing.dispose() });
        const node = await releasing.acquire("release-stop");
        releasing.release("release-stop", node);
        expect(node.destroyed).toBe(true);
        expect(releasing.snapshot()).toEqual([]);
        expect(nativePool.recover).not.toHaveBeenCalled();
    });

    it("keeps destruction idempotent when a node synchronously reenters dispose", async () => {
        loaderLoad.mockResolvedValue({ create: () => new FakeNode() });
        const pool = new PrefabPoolService();
        pool.register({ id: "reentrant", url: "one.lh", maxIdle: 1 });
        const node = await pool.acquire("reentrant") as unknown as FakeNode;
        const destroy = vi.spyOn(node, "destroy").mockImplementation(() => {
            pool.dispose();
            node.destroyed = true;
        });
        expect(() => pool.dispose()).not.toThrow();
        expect(destroy).toHaveBeenCalledOnce();
        expect(pool.snapshot()).toEqual([]);
    });
});
