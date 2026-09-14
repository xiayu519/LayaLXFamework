import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const entry = vi.hoisted(() => ({
    init: vi.fn(), stop: vi.fn(), open: vi.fn(), configure: vi.fn(), ready: false,
}));
vi.mock("../../src/framework/lx", () => ({ lx: {
    init: entry.init, stop: entry.stop, get ready() { return entry.ready; },
} }));
vi.mock("../../src/game/bootstrap/GameStartup", () => ({
    GameApplication: class { constructor(progress: unknown) { entry.configure(progress); } },
    StartupScene: { openStartup: entry.open },
}));

let main: typeof import("../../src/AppEntry").main;
function startupView() {
    return { destroy: vi.fn(), fail: vi.fn(), setViewportProvider: vi.fn(), onServiceProgress: vi.fn(), onSceneProgress: vi.fn() };
}
beforeEach(async () => {
    vi.resetModules();
    entry.init.mockReset().mockImplementation(async () => { entry.ready = true; });
    entry.stop.mockReset().mockImplementation(async () => { entry.ready = false; });
    entry.open.mockReset().mockResolvedValue(startupView());
    entry.configure.mockReset();
    entry.ready = false;
    vi.spyOn(console, "log").mockImplementation(() => {});
    ({ main } = await import("../../src/AppEntry"));
});
afterEach(() => vi.restoreAllMocks());

describe("AppEntry uses one lx initialization", () => {
    it("opens the authored Loading before constructing configuration or initializing modules", async () => {
        const view = startupView();
        let open!: (view: ReturnType<typeof startupView>) => void;
        entry.open.mockReturnValue(new Promise(resolve => { open = resolve; }));
        let finish!: () => void;
        entry.init.mockImplementation(() => new Promise<void>(resolve => { finish = () => { entry.ready = true; resolve(); }; }));
        const starting = main();
        await vi.waitFor(() => expect(entry.open).toHaveBeenCalledOnce());
        expect(entry.configure).not.toHaveBeenCalled();
        expect(entry.init).not.toHaveBeenCalled();
        open(view);
        await vi.waitFor(() => expect(entry.init).toHaveBeenCalledOnce());
        expect(view.destroy).not.toHaveBeenCalled();
        expect(entry.configure).toHaveBeenCalledWith({
            onServiceProgress: expect.any(Function), onSceneProgress: view.onSceneProgress,
        });
        const callbacks = entry.configure.mock.calls[0][0] as { onServiceProgress(progress: unknown): void };
        callbacks.onServiceProgress({ serviceName: "platform", completed: 0, total: 2 });
        callbacks.onServiceProgress({ serviceName: "platform", completed: 1, total: 2 });
        expect(view.setViewportProvider).toHaveBeenCalledOnce();
        expect(view.onServiceProgress).toHaveBeenCalledTimes(2);
        finish();
        await starting;
        expect(view.destroy).toHaveBeenCalledOnce();
        expect(console.log).toHaveBeenCalledExactlyOnceWith("[LX] READY");
    });

    it("shares concurrent and reentrant calls even while root Ready precedes Lobby completion", async () => {
        let nested: Promise<void> | undefined;
        let finish!: () => void;
        entry.init.mockImplementation(() => {
            entry.ready = true;
            nested = main();
            return new Promise<void>(resolve => { finish = resolve; });
        });
        const first = main(), second = main();
        await vi.waitFor(() => expect(finish).toBeDefined());
        let completed = false;
        void second.then(() => { completed = true; });
        await Promise.resolve();
        expect(completed).toBe(false);
        finish();
        await Promise.all([first, second, nested]);
        await main();
        expect(entry.open).toHaveBeenCalledOnce();
        expect(entry.init).toHaveBeenCalledOnce();
    });

    it("shows failure, stops lx and retries through the same entry", async () => {
        const failed = startupView(), replacement = startupView();
        entry.open.mockResolvedValueOnce(failed).mockResolvedValueOnce(replacement);
        entry.init.mockRejectedValueOnce(new Error("initialization failed"));
        await expect(main()).rejects.toThrow("initialization failed");
        expect(entry.stop).toHaveBeenCalledOnce();
        expect(failed.fail).toHaveBeenCalledOnce();
        expect(failed.destroy).not.toHaveBeenCalled();
        expect(console.log).not.toHaveBeenCalled();
        await main();
        expect(failed.destroy).toHaveBeenCalledOnce();
        expect(replacement.destroy).toHaveBeenCalledOnce();
        expect(entry.init).toHaveBeenCalledTimes(2);
    });

    it("retains initialization and cleanup errors", async () => {
        const startFailure = new Error("start failed"), stopFailure = new Error("stop failed");
        entry.init.mockRejectedValue(startFailure);
        entry.stop.mockRejectedValue(stopFailure);
        const result = await main().catch(error => error);
        expect(result).toMatchObject({ errors: [startFailure, stopFailure] });
        expect(console.log).not.toHaveBeenCalled();
    });

    it("does not announce readiness after an interrupted initialization", async () => {
        entry.init.mockResolvedValue(undefined);
        await main();
        expect(entry.ready).toBe(false);
        expect(console.log).not.toHaveBeenCalled();
    });

    it("starts again after an explicit clean stop", async () => {
        await main();
        await entry.stop();
        await main();
        expect(entry.init).toHaveBeenCalledTimes(2);
    });

    it("reports configuration errors on the already-open Loading", async () => {
        const view = startupView();
        entry.open.mockResolvedValue(view);
        entry.configure.mockImplementation(() => { throw new Error("configuration failed"); });
        await expect(main()).rejects.toThrow("configuration failed");
        expect(view.fail).toHaveBeenCalledOnce();
        expect(entry.init).not.toHaveBeenCalled();
        expect(view.destroy).not.toHaveBeenCalled();
    });

    it("honors disabled startup diagnostics", async () => {
        const { logger } = await import("../../src/framework/application/diagnostics/Logger");
        logger.enabled = false;
        try { await main(); expect(console.log).not.toHaveBeenCalled(); }
        finally { logger.enabled = true; }
    });
});
