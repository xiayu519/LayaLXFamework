import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

function deferred<T = void>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

const gc = vi.fn();
const factories = new Map<string, FakePrefab | Promise<FakePrefab>>();
const load = vi.fn(async (url: string) => await factories.get(url) ?? null);
class FakeScene {
    static gc(): void { gc(); }
    parent: object | null = null;
    destroyed = false;
    autoDestroyAtClosed = false;
    open(): void { this.parent = {}; }
    close(): void { this.parent = null; if (this.autoDestroyAtClosed) this.destroy(); }
    destroy(): void { this.destroyed = true; this.parent = null; }
}
class FakePrefab {
    constructor(readonly factory: () => FakeScene) {}
    create(): FakeScene { return this.factory(); }
}
vi.stubGlobal("Laya", {
    Scene: FakeScene, Prefab: FakePrefab, Loader: { HIERARCHY: "HIERARCHY" }, loader: { load },
    timer: { frameOnce: (_delay: number, _caller: unknown, callback: () => void) => callback() },
});

const { BaseGameScene } = await import("../../src/framework/presentation/scene/BaseGameScene");
const { SceneRegistry, SceneRegistryCleanupError } = await import("../../src/framework/presentation/scene/SceneRegistry");
const { SceneTransitionCancelledError } = await import("../../src/framework/presentation/scene/SceneFlow");
type SceneLoadingPresenter = import("../../src/framework/presentation/scene/SceneFlow").SceneLoadingPresenter;
type SceneRoute<T> = import("../../src/framework/presentation/scene/SceneFlow").SceneRoute<T>;

class TestScene extends BaseGameScene<void> {
    prepareGate?: Promise<void>;
    uiGate?: Promise<void>;
    cleanupFailure?: Error;
    leaveCount = 0;
    constructor() {
        super();
        this.own(() => { if (this.cleanupFailure) throw this.cleanupFailure; });
    }
    protected override async onPrepare(): Promise<void> { await this.prepareGate; }
    protected override onTransitionLeaving(): void { this.leaveCount += 1; }
    override async waitForUI(): Promise<void> { await this.uiGate; }
}

const lobby: SceneRoute<void> = { id: "lobby", url: "lobby.ls" };
const battle: SceneRoute<void> = { id: "battle", url: "battle.ls" };
function setup(options: ConstructorParameters<typeof SceneRegistry>[0] = {}) {
    const registry = new SceneRegistry({ waitForFrame: async () => {}, ...options });
    registry.register(lobby); registry.register(battle);
    factories.set(lobby.url, new FakePrefab(() => new TestScene()));
    factories.set(battle.url, new FakePrefab(() => new TestScene()));
    return registry;
}
async function until(predicate: () => boolean): Promise<void> {
    for (let index = 0; index < 100 && !predicate(); index += 1) await Promise.resolve();
    expect(predicate()).toBe(true);
}

beforeEach(() => { factories.clear(); load.mockClear(); gc.mockReset(); });
afterAll(() => vi.unstubAllGlobals());

describe("SceneRegistry", () => {
    it("keeps simultaneous native scenes independent and only replaces the requested route", async () => {
        const registry = setup();
        const [firstLobby, firstBattle] = await Promise.all([registry.open(lobby, undefined), registry.open(battle, undefined)]);
        expect(registry.get(lobby)).toBe(firstLobby);
        expect(registry.get("battle")).toBe(firstBattle);
        const nextLobby = await registry.open(lobby, undefined);
        expect(firstLobby.destroyed).toBe(true);
        expect((firstLobby as TestScene).leaveCount).toBe(1);
        expect(firstBattle.destroyed).toBe(false);
        expect(registry.get(lobby)).toBe(nextLobby);
        await registry.close(lobby);
        expect(nextLobby.destroyed).toBe(true);
        expect(firstBattle.destroyed).toBe(false);
        expect(registry.snapshot().registeredRoutes).toEqual(["lobby", "battle"]);
        await registry.dispose();
        expect(firstBattle.destroyed).toBe(true);
    });

    it("cancels a queued pre-close open without starting a native load", async () => {
        const registry = setup();
        const open = registry.open(lobby, undefined);
        const close = registry.close(lobby);
        await expect(open).rejects.toBeInstanceOf(SceneTransitionCancelledError);
        await close;
        expect(load).not.toHaveBeenCalled();
        expect(registry.get(lobby)).toBeUndefined();
        await registry.dispose();
    });

    it("waits for cancelled native loading and never creates its late prefab", async () => {
        const registry = setup();
        const asset = deferred<FakePrefab>();
        const create = vi.fn(() => new TestScene());
        factories.set(lobby.url, asset.promise);
        const open = registry.open(lobby, undefined);
        await until(() => load.mock.calls.length === 1);
        let closed = false;
        const close = registry.close(lobby).then(() => { closed = true; });
        await Promise.resolve();
        expect(closed).toBe(false);
        expect(gc).not.toHaveBeenCalled();
        asset.resolve(new FakePrefab(create));
        await expect(open).rejects.toBeInstanceOf(SceneTransitionCancelledError);
        await close;
        expect(create).not.toHaveBeenCalled();
        expect(gc).toHaveBeenCalledTimes(1);
        expect(registry.snapshot().pendingTransitions).toBe(0);
        await registry.dispose();
    });

    it("a repeated close invalidates requests queued behind the previous close", async () => {
        const registry = setup();
        const asset = deferred<FakePrefab>();
        factories.set(lobby.url, asset.promise);
        const first = registry.open(lobby, undefined);
        await until(() => load.mock.calls.length === 1);
        const closing = registry.close(lobby);
        const queued = registry.open(lobby, undefined);
        expect(registry.close(lobby)).toBe(closing);
        asset.resolve(new FakePrefab(() => new TestScene()));
        await expect(first).rejects.toBeInstanceOf(SceneTransitionCancelledError);
        await expect(queued).rejects.toBeInstanceOf(SceneTransitionCancelledError);
        await closing;
        expect(load).toHaveBeenCalledTimes(1);
        const fresh = await registry.open(lobby, undefined);
        expect(fresh.destroyed).toBe(false);
        await registry.dispose();
    });

    it("an explicitly new open may wait for close and receives a fresh scene after cleanup", async () => {
        const frame = deferred();
        let holdFrame = false;
        const registry = setup({ waitForFrame: async () => { if (holdFrame) await frame.promise; } });
        const old = await registry.open(lobby, undefined);
        holdFrame = true;
        const closing = registry.close(lobby);
        const queued = registry.open(lobby, undefined);
        expect(old.destroyed).toBe(true);
        expect(registry.get(lobby)).toBeUndefined();
        frame.resolve();
        await closing;
        const fresh = await queued;
        expect(fresh).not.toBe(old);
        expect(registry.get(lobby)).toBe(fresh);
        await registry.dispose();
    });

    it("unregister revokes new opens immediately and stale route objects cannot remove replacements", async () => {
        const registry = setup();
        const asset = deferred<FakePrefab>();
        factories.set(lobby.url, asset.promise);
        const open = registry.open(lobby, undefined);
        await until(() => load.mock.calls.length === 1);
        const unregister = registry.unregister(lobby);
        expect(() => registry.open(lobby, undefined)).toThrow("Unknown or unloading");
        expect(() => registry.register(lobby)).toThrow("Duplicate");
        asset.resolve(new FakePrefab(() => new TestScene()));
        await expect(open).rejects.toBeInstanceOf(SceneTransitionCancelledError);
        await unregister;
        const replacement = { ...lobby };
        registry.register(replacement);
        const live = await registry.open(replacement, undefined);
        await registry.unregister(lobby);
        expect(registry.get(replacement)).toBe(live);
        expect(registry.get(lobby)).toBeUndefined();
        await registry.dispose();
    });

    it("drains an active scene's pending UI before the native destruction frame and collection", async () => {
        const ui = deferred();
        const frame = vi.fn(async () => {});
        const registry = setup({ waitForFrame: frame });
        const scene = await registry.open(lobby, undefined) as TestScene;
        frame.mockClear();
        scene.uiGate = ui.promise;
        let closed = false;
        const close = registry.close(lobby).then(() => { closed = true; });
        expect(scene.destroyed).toBe(true);
        await Promise.resolve();
        expect(closed).toBe(false);
        expect(frame).not.toHaveBeenCalled();
        expect(gc).not.toHaveBeenCalled();
        ui.resolve();
        await close;
        expect(frame).toHaveBeenCalledTimes(1);
        expect(gc).toHaveBeenCalledTimes(1);
        await registry.dispose();
    });

    it("drains UI from a rolled-back scene that never became current", async () => {
        const prepare = deferred();
        const ui = deferred();
        let scene: TestScene | undefined;
        const registry = setup();
        factories.set(lobby.url, new FakePrefab(() => {
            scene = new TestScene(); scene.prepareGate = prepare.promise; scene.uiGate = ui.promise; return scene;
        }));
        const open = registry.open(lobby, undefined);
        await until(() => scene !== undefined);
        let closed = false;
        const close = registry.close(lobby).then(() => { closed = true; });
        prepare.resolve();
        await until(() => scene?.destroyed === true);
        expect(closed).toBe(false);
        expect(gc).not.toHaveBeenCalled();
        ui.resolve();
        await expect(open).rejects.toBeInstanceOf(SceneTransitionCancelledError);
        await close;
        expect(gc).toHaveBeenCalledTimes(1);
        await registry.dispose();
    });

    it.each(["destroy", "ui", "frame", "gc"] as const)("retains %s cleanup failures on repeated close, drain, and disposal", async failureAt => {
        let closing = false;
        const failure = new Error(`${failureAt} cleanup failed`);
        const registry = setup({ waitForFrame: async () => { if (closing && failureAt === "frame") throw failure; } });
        const scene = await registry.open(lobby, undefined) as TestScene;
        if (failureAt === "destroy") scene.cleanupFailure = failure;
        if (failureAt === "ui") scene.waitForUI = async () => { throw failure; };
        if (failureAt === "gc") gc.mockImplementation(() => { throw failure; });
        closing = true;
        await expect(registry.close(lobby)).rejects.toBeInstanceOf(SceneRegistryCleanupError);
        await expect(registry.close(lobby)).rejects.toBeInstanceOf(SceneRegistryCleanupError);
        await expect(registry.waitForPendingLoads()).rejects.toBeInstanceOf(SceneRegistryCleanupError);
        await expect(registry.open(lobby, undefined)).rejects.toBeInstanceOf(SceneRegistryCleanupError);
        expect(registry.snapshot().cleanupFailures).toBe(1);
        await expect(registry.dispose()).rejects.toBeInstanceOf(SceneRegistryCleanupError);
        await expect(registry.dispose()).rejects.toBeInstanceOf(SceneRegistryCleanupError);
        expect(registry.snapshot().pendingTransitions).toBe(0);
    });

    it("shares one Loading presentation across concurrent scenes after its show task has settled", async () => {
        const presenter: SceneLoadingPresenter = { show: vi.fn(), update: vi.fn(), fail: vi.fn(), hide: vi.fn() };
        const registry = setup({ loadingPresenter: presenter });
        const asset = deferred<FakePrefab>();
        factories.set(lobby.url, asset.promise);
        const slow = registry.open(lobby, undefined);
        await until(() => load.mock.calls.length === 1);
        const fast = await registry.open(battle, undefined);
        expect(presenter.show).toHaveBeenCalledTimes(1);
        expect(presenter.hide).not.toHaveBeenCalled();
        await registry.close(battle);
        expect(fast.destroyed).toBe(true);
        expect(presenter.hide).not.toHaveBeenCalled();
        asset.resolve(new FakePrefab(() => new TestScene()));
        await slow;
        expect(presenter.hide).toHaveBeenCalledTimes(1);
        await registry.dispose();
    });

    it("closing one scene cannot cancel the shared pending Loading show for another scene", async () => {
        const shown = deferred();
        const presenter: SceneLoadingPresenter = { show: vi.fn(() => shown.promise), update: vi.fn(), fail: vi.fn(), hide: vi.fn() };
        const registry = setup({ loadingPresenter: presenter });
        const first = registry.open(lobby, undefined);
        const second = registry.open(battle, undefined);
        await until(() => vi.mocked(presenter.show).mock.calls.length === 1);
        const closing = registry.close(lobby);
        expect(presenter.hide).not.toHaveBeenCalled();
        shown.resolve();
        await expect(first).rejects.toBeInstanceOf(SceneTransitionCancelledError);
        const live = await second;
        await closing;
        expect(live.destroyed).toBe(false);
        expect(presenter.show).toHaveBeenCalledTimes(1);
        expect(presenter.hide).toHaveBeenCalledTimes(1);
        await registry.dispose();
    });

    it("does not collect during sibling loads, including a same-route replacement", async () => {
        const registry = setup();
        await registry.open(lobby, undefined);
        const asset = deferred<FakePrefab>();
        factories.set(battle.url, asset.promise);
        const loading = registry.open(battle, undefined);
        await until(() => load.mock.calls.some(([url]) => url === battle.url));
        await registry.open(lobby, undefined);
        expect(gc).not.toHaveBeenCalled();
        await registry.close(lobby);
        expect(gc).not.toHaveBeenCalled();
        asset.resolve(new FakePrefab(() => new TestScene()));
        await loading;
        await registry.close(battle);
        expect(gc).toHaveBeenCalledTimes(1);
        await registry.dispose();
    });

    it("disposes all routes despite one failure and leaves final global collection to runtime", async () => {
        const registry = setup();
        const [first, second] = await Promise.all([registry.open(lobby, undefined), registry.open(battle, undefined)]);
        (first as TestScene).cleanupFailure = new Error("first failed");
        await expect(registry.dispose()).rejects.toBeInstanceOf(SceneRegistryCleanupError);
        expect(first.destroyed).toBe(true);
        expect(second.destroyed).toBe(true);
        expect(gc).not.toHaveBeenCalled();
        expect(registry.snapshot().registeredRoutes).toEqual(["lobby"]);
        expect(() => registry.open(battle, undefined)).toThrow("disposed");
    });

    it("does not return a scene destroyed during its final ready frame", async () => {
        const readyFrame = deferred();
        let waiting = false;
        const registry = setup({ waitForFrame: async () => { waiting = true; await readyFrame.promise; } });
        const open = registry.open(lobby, undefined);
        await until(() => waiting);
        const closing = registry.close(lobby);
        readyFrame.resolve();
        await expect(open).rejects.toBeInstanceOf(SceneTransitionCancelledError);
        await closing;
        expect(registry.get(lobby)).toBeUndefined();
        await registry.dispose();
    });

    it("retains replacement cleanup failures before close and still disposes the route", async () => {
        const registry = setup();
        await registry.open(lobby, undefined);
        gc.mockImplementation(() => { throw new Error("replacement gc failed"); });
        await expect(registry.open(lobby, undefined)).rejects.toThrow("replacement gc failed");
        await expect(registry.waitForPendingLoads()).rejects.toBeInstanceOf(SceneRegistryCleanupError);
        expect(registry.snapshot().cleanupFailures).toBe(1);
        await expect(registry.dispose()).rejects.toBeInstanceOf(SceneRegistryCleanupError);
    });

    it("still destroys the live replacement when an older cancelled scene reports UI cleanup failure", async () => {
        const registry = setup();
        const prepared = deferred();
        let old: TestScene | undefined;
        let count = 0;
        factories.set(lobby.url, new FakePrefab(() => {
            const scene = new TestScene();
            if (++count === 1) {
                old = scene; scene.prepareGate = prepared.promise;
                scene.waitForUI = async () => { throw new Error("old UI cleanup failed"); };
            }
            return scene;
        }));
        const first = registry.open(lobby, undefined);
        await until(() => old !== undefined);
        const live = await registry.open(lobby, undefined);
        prepared.resolve();
        await expect(first).rejects.toBeInstanceOf(SceneRegistryCleanupError);
        expect(live.destroyed).toBe(false);
        await expect(registry.close(lobby)).rejects.toBeInstanceOf(SceneRegistryCleanupError);
        expect(live.destroyed).toBe(true);
        await expect(registry.dispose()).rejects.toBeInstanceOf(SceneRegistryCleanupError);
    });

    it("allows retry after shared Loading presentation creation fails", async () => {
        const show = vi.fn().mockRejectedValueOnce(new Error("loading prefab failed")).mockResolvedValue(undefined);
        const presenter: SceneLoadingPresenter = { show, update: vi.fn(), fail: vi.fn(), hide: vi.fn() };
        const registry = setup({ loadingPresenter: presenter });
        await expect(registry.open(lobby, undefined)).rejects.toThrow("loading prefab failed");
        const retry = await registry.open(lobby, undefined);
        expect(retry.destroyed).toBe(false);
        expect(show).toHaveBeenCalledTimes(2);
        await registry.dispose();
    });

    it("does not start a queued Loading show after its last owner closes", async () => {
        const presenter: SceneLoadingPresenter = { show: vi.fn(), update: vi.fn(), fail: vi.fn(), hide: vi.fn() };
        const registry = setup({ loadingPresenter: presenter });
        const open = registry.open(lobby, undefined);
        // The registry has entered SceneFlow.show, but its shared presenter task has not started yet.
        await Promise.resolve();
        const close = registry.close(lobby);
        await expect(open).rejects.toBeInstanceOf(SceneTransitionCancelledError);
        await close;
        expect(presenter.show).not.toHaveBeenCalled();
        expect(load).not.toHaveBeenCalled();
        await registry.dispose();
    });
});
