import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppBootstrap } from "../../src/framework/bootstrap/AppBootstrap";
import type { ApplicationRuntime, RuntimeSnapshot } from "../../src/framework/bootstrap/createRuntime";

const loader = { id: "laya-loader" };
class FakeScene {}
let lx: typeof import("../../src/framework/lx").lx;
let bindLxRuntime: typeof import("../../src/framework/bootstrap/lxRuntimeHost").bindLxRuntime;
let unbindLxRuntime: typeof import("../../src/framework/bootstrap/lxRuntimeHost").unbindLxRuntime;

beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("Laya", { loader, Scene: FakeScene });
    ({ lx } = await import("../../src/framework/lx"));
    ({ bindLxRuntime, unbindLxRuntime } = await import("../../src/framework/bootstrap/lxRuntimeHost"));
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

function createRuntime(bootstrap = new AppBootstrap([]), pendingCleanup: string[] = []): ApplicationRuntime {
    const runtime = {
        ui: { id: "ui" },
        sceneFlow: { id: "scene-flow" },
        content: { id: "content" },
        config: { id: "config" },
        tables: { id: "tables" },
        settings: { id: "settings" },
        audio: { id: "audio" },
        pool: { id: "pool" },
        performance: { id: "performance" },
        http: { id: "http" },
        platform: { id: "platform" },
        purchase: { id: "purchase" },
        bootstrap,
        snapshot: (): RuntimeSnapshot => ({
            bootstrap: bootstrap.snapshot(), pendingCleanup, gc: "not-requested",
            pools: [], config: [],
            scenes: {
                state: "idle", registeredRoutes: [], requestVersion: 0, pendingTransitions: 0,
            },
            ui: { loading: {}, pendingRequests: [], nativeLoads: 0, managed: [], visible: [], cleanupFailures: 0, scenes: [],
                tips: { queued: 0, active: 0, shown: 0, dropped: 0 } },
        }),
        start: async () => { bindLxRuntime(runtime); await bootstrap.start(); },
        stop: async () => { try { await bootstrap.stop(); } finally { unbindLxRuntime(runtime); } },
    } as unknown as ApplicationRuntime;
    return runtime;
}

describe("lx", () => {
    it("stops the application explicitly and is safe before startup or after shutdown", async () => {
        await lx.stop();
        const stopped = vi.fn();
        const runtime = createRuntime(new AppBootstrap([{ name: "owner", start() {}, stop: stopped }]));
        await runtime.start();
        await Promise.all([lx.stop(), lx.stop()]);
        await lx.stop();
        expect(stopped).toHaveBeenCalledOnce();
        expect(lx.ready).toBe(false);
        expect(() => lx.snapshot()).toThrow("runtime is not attached");
    });

    it("propagates owner shutdown failures through the public stop method", async () => {
        const runtime = createRuntime(new AppBootstrap([{
            name: "broken-owner", start() {}, stop() { throw new Error("cleanup failed"); },
        }]));
        await runtime.start();
        await expect(lx.stop()).rejects.toThrow("failed to stop");
        expect(lx.ready).toBe(false);
    });

    it("exposes framework services and exact Laya loader/scene entry points", async () => {
        const runtime = createRuntime();
        await runtime.start();
        try {
            expect(globalThis.lx).toBe(lx);
            expect(lx.ready).toBe(true);
            expect(lx.ui).toBe(runtime.ui);
            expect(lx.sceneFlow).toBe(runtime.sceneFlow);
            expect(lx.res).toBe(loader);
            expect(lx.scene).toBe(FakeScene);
            expect(lx.audio).toBe(runtime.audio);
            expect(lx.config).toBe(runtime.config);
            expect(lx.tables).toBe(runtime.tables);
            expect(lx.net).toBe(runtime.http);
            expect("App" in lx).toBe(false);
            expect("Spine" in lx).toBe(false);
        } finally {
            await runtime.stop();
        }
        expect(lx.ready).toBe(false);
        expect(() => lx.res).toThrow("runtime is not attached");
    });

    it("rejects a second runtime until the first is detached and clean", async () => {
        const first = createRuntime();
        const second = createRuntime();
        await first.start();
        try {
            expect(() => bindLxRuntime(second)).toThrow("already has an attached runtime");
        } finally {
            await first.stop();
        }
        await second.start();
        await second.stop();
    });

    it("does not retain or recheck a runtime after a clean stop", async () => {
        const retired = createRuntime();
        await retired.start();
        await retired.stop();
        vi.spyOn(retired, "snapshot").mockImplementation(() => { throw new Error("retired runtime accessed"); });

        const next = createRuntime();
        await next.start();
        await next.stop();
    });

    it("hides a retired runtime and blocks replacement until actual startup and late compensation settle", async () => {
        let finishStart!: () => void;
        let finishLateStop!: () => void;
        const startGate = new Promise<void>((resolve) => { finishStart = resolve; });
        const lateStopGate = new Promise<void>((resolve) => { finishLateStop = resolve; });
        let stops = 0;
        let next: ApplicationRuntime;
        let rejectedSynchronousReplacement = false;
        const bootstrap = new AppBootstrap([{
            name: "late-owner",
            start: () => startGate,
            stop: () => {
                if (++stops === 1) return;
                try { bindLxRuntime(next); } catch { rejectedSynchronousReplacement = true; }
                return lateStopGate;
            },
        }]);
        const retired = createRuntime(bootstrap);
        const starting = retired.start().catch((error: unknown) => error);
        await retired.stop();
        await starting;
        next = createRuntime();

        expect(lx.ready).toBe(false);
        expect(() => lx.ui).toThrow("runtime is not attached");
        expect(() => bindLxRuntime(next)).toThrow("cleanup remains incomplete");
        finishStart();
        await vi.waitFor(() => expect(bootstrap.snapshot().pending[0]?.phase).toBe("stop"));
        expect(rejectedSynchronousReplacement).toBe(true);
        expect(() => bindLxRuntime(next)).toThrow("cleanup remains incomplete");
        finishLateStop();
        await vi.waitFor(() => expect(bootstrap.snapshot().pending).toHaveLength(0));
        await next.start();
        await next.stop();
    });

    it("keeps load cleanup quarantined after service shutdown until it settles", async () => {
        const pendingCleanup = ["ui"];
        const retired = createRuntime(undefined, pendingCleanup);
        await retired.start();
        await retired.stop();
        const next = createRuntime();
        expect(() => bindLxRuntime(next)).toThrow("cleanup remains incomplete");
        pendingCleanup.length = 0;
        await next.start();
        await next.stop();
    });

    it("releases a quarantined runtime when late cleanup settles without another bind", async () => {
        const pendingCleanup = ["ui"];
        const retired = createRuntime(undefined, pendingCleanup);
        const snapshot = vi.spyOn(retired, "snapshot");
        await retired.start();
        await retired.stop();
        const callsBeforeCleanup = snapshot.mock.calls.length;

        pendingCleanup.length = 0;
        await vi.waitFor(() => expect(snapshot.mock.calls.length).toBeGreaterThan(callsBeforeCleanup));
        snapshot.mockImplementation(() => { throw new Error("released runtime accessed"); });

        const next = createRuntime();
        await next.start();
        await next.stop();
    });

    it("backs off quarantine checks while late cleanup remains unsettled", async () => {
        vi.useFakeTimers();
        const timer = vi.spyOn(globalThis, "setTimeout");
        const pendingCleanup = ["ui"];
        const retired = createRuntime(undefined, pendingCleanup);
        await retired.start();
        await retired.stop();

        expect(timer).toHaveBeenCalledWith(expect.any(Function), 25);
        await vi.advanceTimersByTimeAsync(25);
        expect(timer).toHaveBeenCalledWith(expect.any(Function), 50);

        pendingCleanup.length = 0;
        await vi.advanceTimersByTimeAsync(50);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("fails closed after an unrecovered stop error without exposing or resetting the old runtime", async () => {
        const retired = createRuntime(new AppBootstrap([{
            name: "broken-owner", start() {}, stop() { throw new Error("owner still active"); },
        }]));
        await retired.start();
        await expect(retired.stop()).rejects.toThrow("failed to stop");
        expect(() => lx.ui).toThrow("runtime is not attached");
        expect(() => bindLxRuntime(createRuntime())).toThrow("cleanup remains incomplete");
    });

    it("fails closed when a retired runtime snapshot cannot prove cleanup", async () => {
        const retired = createRuntime();
        await retired.start();
        vi.spyOn(retired, "snapshot").mockImplementation(() => { throw new Error("diagnostics unavailable"); });
        await retired.stop();
        expect(() => bindLxRuntime(createRuntime())).toThrow("cleanup remains incomplete");
    });
});
