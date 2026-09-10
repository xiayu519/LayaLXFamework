import { describe, expect, it, vi } from "vitest";
import {
    WorldCleanupError, WorldInitializationCancelledError, WorldInitializationError, WorldRegistry,
} from "../../src/framework/application/world/WorldRegistry";
import type { WorldContext, WorldDefinition } from "../../src/framework/application/world/WorldDefinition";

function deferred<T = void>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

describe("WorldRegistry", () => {
    it("initializes each id once and exposes only its live registration scope", async () => {
        const worlds = new WorldRegistry();
        const gate = deferred();
        const initialize = vi.fn(async (scope: WorldContext) => {
            expect(scope.id).toBe("lobby");
            await gate.promise;
        });
        worlds.register({ id: "lobby", initialize });
        const first = worlds.enter("lobby");
        const concurrent = worlds.enter("lobby");
        expect(concurrent).toBe(first);
        expect(worlds.get("lobby")).toBeUndefined();
        expect(worlds.snapshot().worlds[0].pendingInitialization).toBe(true);
        gate.resolve();
        const scope = await first;
        expect(worlds.get("lobby")).toBe(scope);
        expect(await worlds.enter("lobby")).toBe(scope);
        expect(initialize).toHaveBeenCalledTimes(1);
        expect(Object.keys(scope).sort()).toEqual(["id", "own", "signal"]);
        await worlds.dispose();
    });

    it("unloads one world in reverse order without invalidating another", async () => {
        const worlds = new WorldRegistry();
        const trace: string[] = [];
        const firstCleanup = deferred();
        worlds.register({ id: "lobby", initialize(scope) {
            scope.own(() => { trace.push("lobby:registered-ui"); });
            scope.own(async () => {
                trace.push("lobby:scene-start");
                await firstCleanup.promise;
                trace.push("lobby:scene-end");
            });
        } });
        worlds.register({ id: "battle", initialize(scope) {
            scope.own(() => { trace.push("battle:cleanup"); });
        } });
        const lobby = await worlds.enter("lobby");
        const battle = await worlds.enter("battle");
        const exit = worlds.exit("lobby");
        expect(lobby.signal.aborted).toBe(true);
        expect(battle.signal.aborted).toBe(false);
        expect(worlds.get("lobby")).toBeUndefined();
        expect(worlds.get("battle")).toBe(battle);
        await Promise.resolve();
        expect(trace).toEqual(["lobby:scene-start"]);
        firstCleanup.resolve();
        await exit;
        expect(trace).toEqual(["lobby:scene-start", "lobby:scene-end", "lobby:registered-ui"]);
        await worlds.dispose();
        expect(trace[trace.length - 1]).toBe("battle:cleanup");
    });

    it("cancels enter promptly but drains original initialization and late own callbacks", async () => {
        const worlds = new WorldRegistry();
        const initializeStarted = deferred<WorldContext>();
        const load = deferred();
        const lateCleanup = deferred();
        const trace: string[] = [];
        worlds.register({ id: "battle", async initialize(scope) {
            scope.own(() => { trace.push("early-cleanup"); });
            initializeStarted.resolve(scope);
            await load.promise;
            scope.own(async () => { trace.push("late-cleanup-start"); await lateCleanup.promise; });
        } });
        const enter = worlds.enter("battle");
        const scope = await initializeStarted.promise;
        let exited = false;
        const exit = worlds.exit("battle").then(() => { exited = true; });
        await expect(enter).rejects.toBeInstanceOf(WorldInitializationCancelledError);
        expect(scope.signal.aborted).toBe(true);
        expect(trace).toEqual(["early-cleanup"]);
        expect(exited).toBe(false);
        await expect(worlds.enter("battle")).rejects.toThrow("not finished unloading");
        load.resolve();
        // The drain observes late callback work even though the caller-facing enter already rejected.
        let drained = false;
        const drain = worlds.waitForPendingLoads().then(() => { drained = true; });
        await Promise.resolve();
        expect(drained).toBe(false);
        lateCleanup.resolve();
        await Promise.all([exit, drain]);
        expect(trace).toEqual(["early-cleanup", "late-cleanup-start"]);
        expect(worlds.snapshot().pendingLoads).toBe(0);
        expect(worlds.snapshot().worlds).toEqual([]);
        await worlds.dispose();
    });

    it("runs teardown before waiting for initialization that teardown itself unblocks", async () => {
        const worlds = new WorldRegistry();
        const started = deferred();
        const sceneUnloaded = deferred();
        const cleanup = vi.fn(() => sceneUnloaded.resolve());
        worlds.register({ id: "battle", async initialize(scope) {
            scope.own(cleanup);
            started.resolve();
            await sceneUnloaded.promise;
        } });
        const enter = worlds.enter("battle");
        await started.promise;
        await worlds.exit("battle");
        await expect(enter).rejects.toBeInstanceOf(WorldInitializationCancelledError);
        expect(cleanup).toHaveBeenCalledTimes(1);
        await worlds.dispose();
    });

    it("rolls back partial initialization before exposing the failure and permits a fresh entry", async () => {
        const worlds = new WorldRegistry();
        const error = new Error("scene failed to load");
        const cleanup = vi.fn();
        let attempts = 0;
        worlds.register({ id: "battle", initialize(scope) {
            scope.own(cleanup);
            if (++attempts === 1) throw error;
        } });
        await expect(worlds.enter("battle")).rejects.toBe(error);
        expect(cleanup).toHaveBeenCalledTimes(1);
        expect(worlds.get("battle")).toBeUndefined();
        const next = await worlds.enter("battle");
        expect(next.signal.aborted).toBe(false);
        await worlds.dispose();
        expect(cleanup).toHaveBeenCalledTimes(2);
    });

    it("continues cleanup after failures and retains diagnostics on repeated exit and drain", async () => {
        const worlds = new WorldRegistry();
        const failures = [new Error("scene unload failed"), new Error("events failed")];
        const final = vi.fn();
        worlds.register({ id: "battle", initialize(scope) {
            scope.own(final);
            scope.own(async () => { throw failures[1]; });
            scope.own(() => { throw failures[0]; });
        } });
        await worlds.enter("battle");
        await expect(worlds.exit("battle")).rejects.toMatchObject({ errors: failures });
        await expect(worlds.exit("battle")).rejects.toBeInstanceOf(WorldCleanupError);
        await expect(worlds.waitForPendingLoads()).rejects.toMatchObject({ errors: failures });
        await expect(worlds.enter("battle")).rejects.toThrow("not finished unloading");
        expect(final).toHaveBeenCalledTimes(1);
        expect(worlds.snapshot()).toMatchObject({ pendingLoads: 0, cleanupFailures: 2 });
        expect(worlds.snapshot().worlds[0].state).toBe("cleanup-failed");
        await expect(worlds.dispose()).rejects.toBeInstanceOf(WorldCleanupError);
        await expect(worlds.dispose()).rejects.toBeInstanceOf(WorldCleanupError);
    });

    it("preserves initialization and rollback errors together", async () => {
        const worlds = new WorldRegistry();
        const cause = new Error("initialize failed");
        const cleanupError = new Error("rollback failed");
        worlds.register({ id: "battle", initialize(scope) {
            scope.own(() => { throw cleanupError; });
            throw cause;
        } });
        const enter = worlds.enter("battle");
        await expect(enter).rejects.toBeInstanceOf(WorldInitializationError);
        await expect(enter).rejects.toMatchObject({
            name: "WorldInitializationError", cause, cleanupErrors: [cleanupError],
        });
        await expect(worlds.dispose()).rejects.toBeInstanceOf(WorldCleanupError);
    });

    it("creates fresh instance tokens on reentry and old late cleanup cannot remove the replacement", async () => {
        const worlds = new WorldRegistry();
        worlds.register({ id: "lobby", initialize() {} });
        const old = await worlds.enter("lobby");
        await worlds.exit("lobby");
        const current = await worlds.enter("lobby");
        expect(current).not.toBe(old);
        expect(current.signal).not.toBe(old.signal);
        const late = vi.fn();
        old.own(late);
        await worlds.waitForPendingLoads();
        expect(late).toHaveBeenCalledTimes(1);
        expect(worlds.get("lobby")).toBe(current);
        expect(current.signal.aborted).toBe(false);
        await worlds.dispose();
    });

    it("awaits a cleanup registered by another async cleanup", async () => {
        const worlds = new WorldRegistry();
        const tail = deferred();
        let nestedCompleted = false;
        worlds.register({ id: "battle", initialize(scope) {
            scope.own(async () => {
                await Promise.resolve();
                scope.own(async () => { await tail.promise; nestedCompleted = true; });
            });
        } });
        await worlds.enter("battle");
        const exit = worlds.exit("battle");
        await Promise.resolve();
        expect(nestedCompleted).toBe(false);
        tail.resolve();
        await exit;
        expect(nestedCompleted).toBe(true);
        expect(worlds.snapshot().pendingLoads).toBe(0);
        await worlds.dispose();
    });

    it("unregisters only after unloading and ignores a stale definition identity", async () => {
        const worlds = new WorldRegistry();
        const unloading = deferred();
        const old: WorldDefinition = { id: "lobby", initialize(scope) { scope.own(() => unloading.promise); } };
        const replacement: WorldDefinition = { id: "lobby", initialize() {} };
        worlds.register(old);
        const oldScope = await worlds.enter("lobby");
        const remove = worlds.unregister(old);
        expect(oldScope.signal.aborted).toBe(true);
        expect(worlds.snapshot().registered).toEqual(["lobby"]);
        await expect(worlds.enter("lobby")).rejects.toThrow("being unregistered");
        unloading.resolve();
        await remove;
        worlds.register(replacement);
        await worlds.unregister(old);
        const active = await worlds.enter("lobby");
        expect(worlds.get("lobby")).toBe(active);
        await worlds.unregister("lobby");
        expect(worlds.snapshot().registered).toEqual([]);
        await worlds.dispose();
    });

    it("disposes every world even if one cleanup fails and forbids new registrations", async () => {
        const worlds = new WorldRegistry();
        const otherCleanup = vi.fn();
        worlds.register({ id: "lobby", initialize(scope) { scope.own(() => { throw new Error("cleanup"); }); } });
        worlds.register({ id: "battle", initialize(scope) { scope.own(otherCleanup); } });
        const [lobby, battle] = await Promise.all([worlds.enter("lobby"), worlds.enter("battle")]);
        const dispose = worlds.dispose();
        expect(lobby.signal.aborted).toBe(true);
        expect(battle.signal.aborted).toBe(true);
        await expect(dispose).rejects.toBeInstanceOf(WorldCleanupError);
        expect(otherCleanup).toHaveBeenCalledTimes(1);
        expect(worlds.snapshot().registered).toEqual([]);
        expect(() => worlds.register({ id: "new", initialize() {} })).toThrow("disposed");
        await expect(worlds.enter("battle")).rejects.toThrow("disposed");
    });

    it("handles reentrant exit from an abort listener without duplicate teardown", async () => {
        const worlds = new WorldRegistry();
        const cleanup = vi.fn();
        let reentered: Promise<void> | undefined;
        worlds.register({ id: "lobby", initialize(scope) {
            scope.own(cleanup);
            scope.signal.addEventListener("abort", () => { reentered = worlds.exit("lobby"); }, { once: true });
        } });
        await worlds.enter("lobby");
        const exit = worlds.exit("lobby");
        expect(reentered).toBe(exit);
        await exit;
        expect(cleanup).toHaveBeenCalledTimes(1);
        await worlds.dispose();
    });

    it("can cancel before initialize starts and observes a late rejected initialization", async () => {
        const worlds = new WorldRegistry();
        const initialize = vi.fn();
        worlds.register({ id: "unstarted", initialize });
        const skipped = worlds.enter("unstarted");
        await worlds.exit("unstarted");
        await expect(skipped).rejects.toBeInstanceOf(WorldInitializationCancelledError);
        expect(initialize).not.toHaveBeenCalled();
        const load = deferred();
        const started = deferred();
        worlds.register({ id: "late-failure", async initialize() { started.resolve(); await load.promise; } });
        const enter = worlds.enter("late-failure");
        await started.promise;
        const exit = worlds.exit("late-failure");
        await expect(enter).rejects.toBeInstanceOf(WorldInitializationCancelledError);
        load.reject(new Error("late loader failure"));
        await exit;
        await worlds.waitForPendingLoads();
        expect(worlds.snapshot().pendingLoads).toBe(0);
        await worlds.dispose();
    });

    it("retains a late cleanup failure after initialize was cancelled", async () => {
        const worlds = new WorldRegistry();
        const started = deferred();
        const load = deferred();
        const failure = new Error("late resource cleanup failed");
        worlds.register({ id: "battle", async initialize(scope) {
            started.resolve();
            await load.promise;
            scope.own(async () => { throw failure; });
        } });
        const enter = worlds.enter("battle");
        await started.promise;
        const exit = worlds.exit("battle");
        await expect(enter).rejects.toBeInstanceOf(WorldInitializationCancelledError);
        load.resolve();
        await expect(exit).rejects.toMatchObject({ errors: [failure] });
        await expect(worlds.waitForPendingLoads()).rejects.toMatchObject({ errors: [failure] });
        expect(worlds.snapshot()).toMatchObject({ pendingLoads: 0, cleanupFailures: 1 });
        await expect(worlds.dispose()).rejects.toBeInstanceOf(WorldCleanupError);
    });

    it("disposes pending worlds once even when abort listeners reenter disposal", async () => {
        const worlds = new WorldRegistry();
        const started = deferred();
        const load = deferred();
        const cleanup = vi.fn();
        let reentered: Promise<void> | undefined;
        worlds.register({ id: "battle", async initialize(scope) {
            scope.signal.addEventListener("abort", () => { reentered = worlds.dispose(); }, { once: true });
            started.resolve();
            await load.promise;
            scope.own(cleanup);
        } });
        const enter = worlds.enter("battle");
        await started.promise;
        const dispose = worlds.dispose();
        expect(reentered).toBe(dispose);
        await expect(enter).rejects.toBeInstanceOf(WorldInitializationCancelledError);
        load.resolve();
        await dispose;
        expect(cleanup).toHaveBeenCalledTimes(1);
        expect(worlds.snapshot()).toEqual({ registered: [], worlds: [], pendingLoads: 0, cleanupFailures: 0 });
    });

    it("rejects duplicate and unknown ids without creating a hidden scope", async () => {
        const worlds = new WorldRegistry();
        const definition = { id: "lobby", initialize() {} };
        worlds.register(definition);
        expect(() => worlds.register(definition)).toThrow("already registered");
        expect(() => worlds.register({ id: " ", initialize() {} })).toThrow("must not be empty");
        await expect(worlds.enter("missing")).rejects.toThrow("not registered");
        expect(worlds.get("missing")).toBeUndefined();
        await worlds.exit("missing");
        await worlds.unregister("missing");
        await worlds.dispose();
    });
});
