import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppBootstrap } from "../../src/framework/bootstrap/AppBootstrap";
import type { ApplicationRuntime, RuntimeSnapshot } from "../../src/framework/bootstrap/createRuntime";

const loader = { id: "laya-loader" };
class FakeScene {}
let LX: typeof import("../../src/framework/LX").LX;
let bindLXRuntime: typeof import("../../src/framework/bootstrap/LXRuntimeHost").bindLXRuntime;
let unbindLXRuntime: typeof import("../../src/framework/bootstrap/LXRuntimeHost").unbindLXRuntime;

beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("Laya", { loader, Scene: FakeScene });
    ({ LX } = await import("../../src/framework/LX"));
    ({ bindLXRuntime, unbindLXRuntime } = await import("../../src/framework/bootstrap/LXRuntimeHost"));
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

function createRuntime(bootstrap = new AppBootstrap([]), pendingCleanup: string[] = []): ApplicationRuntime {
    const runtime = {
        ui: { id: "ui" },
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
            ui: { loading: {}, pendingRequests: [], nativeLoads: 0, managed: [], visible: [], cleanupFailures: 0,
                tips: { queued: 0, active: 0, shown: 0, dropped: 0 } },
        }),
        start: async () => { bindLXRuntime(runtime); await bootstrap.start(); },
        stop: async () => { try { await bootstrap.stop(); } finally { unbindLXRuntime(runtime); } },
    } as unknown as ApplicationRuntime;
    return runtime;
}

describe("LX", () => {
    it("exposes framework services and exact Laya loader/scene entry points", async () => {
        const runtime = createRuntime();
        await runtime.start();
        try {
            expect(globalThis.LX).toBe(LX);
            expect(LX.Ready).toBe(true);
            expect(LX.UI).toBe(runtime.ui);
            expect(LX.Res).toBe(loader);
            expect(LX.Scene).toBe(FakeScene);
            expect(LX.Audio).toBe(runtime.audio);
            expect(LX.Config).toBe(runtime.config);
            expect(LX.Tables).toBe(runtime.tables);
            expect(LX.Net).toBe(runtime.http);
            expect("App" in LX).toBe(false);
            expect("Spine" in LX).toBe(false);
        } finally {
            await runtime.stop();
        }
        expect(LX.Ready).toBe(false);
        expect(() => LX.Res).toThrow("runtime is not attached");
    });

    it("rejects a second runtime until the first is detached and clean", async () => {
        const first = createRuntime();
        const second = createRuntime();
        await first.start();
        try {
            expect(() => bindLXRuntime(second)).toThrow("already has an attached runtime");
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
                try { bindLXRuntime(next); } catch { rejectedSynchronousReplacement = true; }
                return lateStopGate;
            },
        }]);
        const retired = createRuntime(bootstrap);
        const starting = retired.start().catch((error: unknown) => error);
        await retired.stop();
        await starting;
        next = createRuntime();

        expect(LX.Ready).toBe(false);
        expect(() => LX.UI).toThrow("runtime is not attached");
        expect(() => bindLXRuntime(next)).toThrow("cleanup remains incomplete");
        finishStart();
        await vi.waitFor(() => expect(bootstrap.snapshot().pending[0]?.phase).toBe("stop"));
        expect(rejectedSynchronousReplacement).toBe(true);
        expect(() => bindLXRuntime(next)).toThrow("cleanup remains incomplete");
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
        expect(() => bindLXRuntime(next)).toThrow("cleanup remains incomplete");
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
        expect(() => LX.UI).toThrow("runtime is not attached");
        expect(() => bindLXRuntime(createRuntime())).toThrow("cleanup remains incomplete");
    });

    it("fails closed when a retired runtime snapshot cannot prove cleanup", async () => {
        const retired = createRuntime();
        await retired.start();
        vi.spyOn(retired, "snapshot").mockImplementation(() => { throw new Error("diagnostics unavailable"); });
        await retired.stop();
        expect(() => bindLXRuntime(createRuntime())).toThrow("cleanup remains incomplete");
    });
});
