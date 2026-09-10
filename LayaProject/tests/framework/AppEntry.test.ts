import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppBootstrap } from "../../src/framework/bootstrap/AppBootstrap";

const entry = vi.hoisted(() => ({ createApplication: vi.fn(), ready: false }));
vi.mock("../../src/game/bootstrap/createApplication", () => ({ createApplication: entry.createApplication }));
vi.mock("../../src/framework/lx", () => ({ lx: { get ready() { return entry.ready; } } }));

let main: typeof import("../../src/AppEntry").main;

beforeEach(async () => {
    vi.resetModules();
    entry.createApplication.mockReset();
    entry.ready = false;
    vi.spyOn(console, "log").mockImplementation(() => {});
    ({ main } = await import("../../src/AppEntry"));
});

afterEach(() => vi.restoreAllMocks());

function runtime(bootstrap = new AppBootstrap([])) {
    return {
        bootstrap,
        start: vi.fn(async () => {
            await bootstrap.start();
            entry.ready = bootstrap.state === "running";
        }),
        stop: vi.fn(async () => {
            try { await bootstrap.stop(); } finally { entry.ready = false; }
        }),
    };
}

describe("native AppEntry", () => {
    it("shares concurrent and reentrant entry without requiring an engine Script or scene", async () => {
        let nested: Promise<void> | undefined;
        const application = runtime(new AppBootstrap([{
            name: "entry-reentry", start() { nested = main(); }, stop() {},
        }]));
        entry.createApplication.mockReturnValue(application);

        await Promise.all([main(), main()]);
        await nested;
        await main();

        expect(entry.createApplication).toHaveBeenCalledOnce();
        expect(application.start).toHaveBeenCalledOnce();
        expect(console.log).toHaveBeenCalledExactlyOnceWith("[LX] READY");
        await application.stop();
    });

    it("rolls back in reverse order, propagates startup failure and permits a fresh attempt", async () => {
        const calls: string[] = [];
        const failed = runtime(new AppBootstrap([
            { name: "first", start() { calls.push("start:first"); }, stop() { calls.push("stop:first"); } },
            { name: "second", start() { throw new Error("initialization failed"); }, stop() { calls.push("stop:second"); } },
        ]));
        const replacement = runtime();
        entry.createApplication.mockReturnValueOnce(failed).mockReturnValueOnce(replacement);

        await expect(main()).rejects.toThrow("initialization failed");
        expect(calls).toEqual(["start:first", "stop:second", "stop:first"]);
        expect(failed.stop).toHaveBeenCalledOnce();
        expect(console.log).not.toHaveBeenCalled();
        await main();
        expect(replacement.start).toHaveBeenCalledOnce();
        await replacement.stop();
    });

    it("does not announce readiness when shutdown interrupts startup", async () => {
        let started!: () => void;
        const pending = new Promise<void>((resolve) => { started = resolve; });
        const application = runtime(new AppBootstrap([{
            name: "loading", start: () => pending, stop() {},
        }]));
        entry.createApplication.mockReturnValue(application);
        const result = main().catch((error: unknown) => error);
        await vi.waitFor(() => expect(application.bootstrap.state).toBe("starting"));
        await application.stop();
        expect(await result).toBeInstanceOf(Error);
        expect(console.log).not.toHaveBeenCalled();
        started();
        await vi.waitFor(() => expect(application.bootstrap.snapshot().pending).toHaveLength(0));
    });

    it("retains startup and rollback errors for the native error handler", async () => {
        const startFailure = new Error("start failed");
        const stopFailure = new Error("stop failed");
        entry.createApplication.mockReturnValue({
            start: vi.fn().mockRejectedValue(startFailure),
            stop: vi.fn().mockRejectedValue(stopFailure),
        });
        const result = await main().catch((error: unknown) => error);
        expect(result).toBeInstanceOf(Error);
        expect(result).toMatchObject({ errors: [startFailure, stopFailure] });
        expect(console.log).not.toHaveBeenCalled();
    });

    it("creates a new application after an explicit clean shutdown", async () => {
        const first = runtime();
        const second = runtime();
        entry.createApplication.mockReturnValueOnce(first).mockReturnValueOnce(second);
        await main();
        await first.stop();
        await main();
        expect(entry.createApplication).toHaveBeenCalledTimes(2);
        expect(second.bootstrap.state).toBe("running");
        await second.stop();
    });
});
