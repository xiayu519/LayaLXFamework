import { afterAll, describe, expect, it, vi } from "vitest";
import type { ResourceGroupController } from "../src/framework/application/resource/ResourceGroup";

class FakeNode {
    active = true;
    destroyed = false;
    removeSelf = vi.fn(() => this);

    destroy(): void {
        this.destroyed = true;
    }
}

vi.stubGlobal("Laya", {
    Node: FakeNode,
    Loader: { HIERARCHY: "HIERARCHY" },
    loader: { load: vi.fn() },
});

const { PrefabPoolService } = await import("../src/framework/infrastructure/pool/PrefabPoolService");

afterAll(() => vi.unstubAllGlobals());

function resources(): ResourceGroupController {
    return {
        assign: vi.fn(),
        acquire: vi.fn((group: string) => {
            let released = false;
            return { group, get released() { return released; }, release: () => { released = true; } };
        }),
        releaseGroupIfUnused: vi.fn(() => true),
    };
}

describe("PrefabPoolService", () => {
    it("reuses reset nodes and rejects double or foreign returns", async () => {
        const prefab = { create: vi.fn(() => new FakeNode()) };
        vi.mocked(Laya.loader.load).mockResolvedValue(prefab as unknown as Laya.Prefab);
        const pool = new PrefabPoolService(resources());
        const onRelease = vi.fn();
        pool.register({ id: "enemy", url: "prefab/enemy.lh", group: "battle", maxIdle: 1, onRelease });

        const first = await pool.acquire<Laya.Node>("enemy");
        pool.release("enemy", first);
        const second = await pool.acquire<Laya.Node>("enemy");

        expect(second).toBe(first);
        expect(onRelease).toHaveBeenCalledWith(first);
        expect(prefab.create).toHaveBeenCalledOnce();
        pool.release("enemy", second);
        expect(() => pool.release("enemy", second)).toThrow("already released");
        expect(() => pool.release("enemy", new FakeNode() as unknown as Laya.Node)).toThrow("does not belong");
    });

    it("enforces active/idle limits and refuses unsafe drains", async () => {
        const created: FakeNode[] = [];
        vi.mocked(Laya.loader.load).mockResolvedValue({
            create: () => {
                const node = new FakeNode();
                created.push(node);
                return node;
            },
        } as unknown as Laya.Prefab);
        const pool = new PrefabPoolService(resources());
        pool.register({ id: "fx", url: "prefab/fx.lh", group: "battle", maxIdle: 0, maxActive: 1 });

        const node = await pool.acquire<Laya.Node>("fx");
        await expect(pool.acquire("fx")).rejects.toThrow("maxActive");
        expect(() => pool.drain("fx")).toThrow("Cannot drain");

        pool.release("fx", node);
        expect(created[0].destroyed).toBe(true);
        pool.drain("fx");
        expect(pool.snapshot()[0]).toMatchObject({ active: 0, idle: 0, resourceHeld: false });
    });

    it("reserves active capacity while an acquire is still loading", async () => {
        let resolvePrefab!: (prefab: Laya.Prefab) => void;
        vi.mocked(Laya.loader.load).mockReturnValue(new Promise((resolve) => {
            resolvePrefab = resolve;
        }));
        const pool = new PrefabPoolService(resources());
        pool.register({ id: "bullet", url: "prefab/bullet.lh", group: "battle", maxIdle: 1, maxActive: 1 });

        const first = pool.acquire("bullet");
        expect(pool.snapshot()[0].pending).toBe(1);
        await expect(pool.acquire("bullet")).rejects.toThrow("maxActive");
        expect(() => pool.drain("bullet")).toThrow("pending node");

        resolvePrefab({ create: () => new FakeNode() } as unknown as Laya.Prefab);
        const node = await first;
        expect(pool.snapshot()[0]).toMatchObject({ active: 1, pending: 0 });
        pool.release("bullet", node);
    });

    it("cleans a load that completes after disposal", async () => {
        let resolvePrefab!: (prefab: Laya.Prefab) => void;
        vi.mocked(Laya.loader.load).mockReturnValue(new Promise((resolve) => {
            resolvePrefab = resolve;
        }));
        const owner = resources();
        const pool = new PrefabPoolService(owner);
        pool.register({ id: "late", url: "prefab/late.lh", group: "late", maxIdle: 1 });

        const acquire = pool.acquire("late");
        pool.dispose();
        resolvePrefab({ create: () => new FakeNode() } as unknown as Laya.Prefab);

        await expect(acquire).rejects.toThrow("disposed while loading");
        expect(owner.releaseGroupIfUnused).toHaveBeenCalled();
    });
});
