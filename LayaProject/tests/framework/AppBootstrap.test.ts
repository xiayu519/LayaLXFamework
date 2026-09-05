import { afterEach, describe, expect, it, vi } from "vitest";
import {
    AppBootstrap,
    BootstrapStartError,
    BootstrapStopError,
    type AppService,
} from "../../src/framework/bootstrap/AppBootstrap";

afterEach(() => vi.useRealTimers());

function service(name: string, events: string[], failStart = false, failStop = false): AppService {
    return {
        name,
        start(): void {
            events.push(`start:${name}`);
            if (failStart) {
                throw new Error(`start:${name}`);
            }
        },
        stop(): void {
            events.push(`stop:${name}`);
            if (failStop) {
                throw new Error(`stop:${name}`);
            }
        },
    };
}

describe("AppBootstrap", () => {
    it("publishes shared tasks before synchronous service re-entry", async () => {
        let nestedStart: Promise<void> | undefined;
        let nestedStop: Promise<void> | undefined;
        const bootstrap = new AppBootstrap([{
            name: "reentrant", start() { nestedStart = bootstrap.start(); },
            stop() { nestedStop = bootstrap.stop(); },
        }]);
        const start = bootstrap.start();
        expect(nestedStart).toBe(start);
        await start;
        const stop = bootstrap.stop();
        await stop;
        expect(nestedStop).toBe(stop);
    });
    it("starts in order and stops in reverse order", async () => {
        const events: string[] = [];
        const bootstrap = new AppBootstrap([
            service("one", events),
            service("two", events),
        ]);

        await bootstrap.start();
        await bootstrap.start();
        await bootstrap.stop();

        expect(events).toEqual(["start:one", "start:two", "stop:two", "stop:one"]);
        expect(bootstrap.state).toBe("stopped");
    });

    it("rolls back completed services when a later service fails", async () => {
        const events: string[] = [];
        const bootstrap = new AppBootstrap([
            service("one", events),
            service("two", events, true),
        ]);

        const error = await bootstrap.start().catch((cause: unknown) => cause);

        expect(error).toBeInstanceOf(BootstrapStartError);
        expect((error as BootstrapStartError).serviceName).toBe("two");
        expect(events).toEqual(["start:one", "start:two", "stop:two", "stop:one"]);
        expect(bootstrap.state).toBe("stopped");
    });

    it("continues stopping after an error and reports the aggregate", async () => {
        const events: string[] = [];
        const bootstrap = new AppBootstrap([
            service("one", events),
            service("two", events, false, true),
        ]);
        await bootstrap.start();

        const error = await bootstrap.stop().catch((cause: unknown) => cause);

        expect(error).toBeInstanceOf(BootstrapStopError);
        expect(events.slice(-2)).toEqual(["stop:two", "stop:one"]);
    });

    it("shares startup, cancels waiting on stop and compensates a late completion", async () => {
        const events: string[] = [];
        let finishStart!: () => void;
        const startGate = new Promise<void>((resolve) => { finishStart = resolve; });
        const bootstrap = new AppBootstrap([{
            name: "slow",
            async start(): Promise<void> {
                events.push("start:slow");
                await startGate;
            },
            stop(): void {
                events.push("stop:slow");
            },
        }]);

        const firstStart = bootstrap.start();
        const secondStart = bootstrap.start();
        const failure = firstStart.catch((error: unknown) => error);
        const stop = bootstrap.stop();

        expect(secondStart).toBe(firstStart);
        await stop;
        expect(await failure).toBeInstanceOf(BootstrapStartError);
        expect(bootstrap.snapshot().pending).toHaveLength(1);
        finishStart();
        await vi.waitFor(() => expect(bootstrap.snapshot().pending).toHaveLength(0));

        expect(events).toEqual(["start:slow", "stop:slow", "stop:slow"]);
        expect(bootstrap.state).toBe("stopped");
    });

    it("shares an in-flight stop and rejects restart after terminal shutdown", async () => {
        let finishStop!: () => void;
        const stopGate = new Promise<void>((resolve) => { finishStop = resolve; });
        const bootstrap = new AppBootstrap([{
            name: "slow",
            start(): void {},
            stop(): Promise<void> {
                return stopGate;
            },
        }]);
        await bootstrap.start();

        const firstStop = bootstrap.stop();
        const secondStop = bootstrap.stop();
        expect(secondStop).toBe(firstStop);
        expect(bootstrap.state).toBe("stopping");

        finishStop();
        await firstStop;
        await expect(bootstrap.start()).rejects.toThrow("Cannot start while bootstrap state is 'stopped'.");
    });

    it("times out startup with observable pending work and still rolls back", async () => {
        vi.useFakeTimers();
        const stopped = vi.fn();
        const bootstrap = new AppBootstrap([{
            name: "hung", start: () => new Promise<void>(() => {}), stop: stopped,
        }], { startTimeoutMs: 20 });
        const result = bootstrap.start().catch((error: unknown) => error);
        await vi.advanceTimersByTimeAsync(25);
        expect(await result).toBeInstanceOf(BootstrapStartError);
        expect(stopped).toHaveBeenCalledOnce();
        expect(bootstrap.snapshot().pending[0]).toMatchObject({ serviceName: "hung", phase: "start", abandoned: true });
    });

    it("bounds a hanging stop and continues stopping independent services", async () => {
        vi.useFakeTimers();
        const stopped = vi.fn();
        const bootstrap = new AppBootstrap([
            { name: "first", start() {}, stop: stopped },
            { name: "hung", start() {}, stop: () => new Promise<void>(() => {}) },
        ], { stopTimeoutMs: 20 });
        await bootstrap.start();
        const result = bootstrap.stop().catch((error: unknown) => error);
        await vi.advanceTimersByTimeAsync(25);
        expect(await result).toBeInstanceOf(BootstrapStopError);
        expect(stopped).toHaveBeenCalledOnce();
        expect(bootstrap.snapshot().failedStops).toContain("hung");
    });

    it("clears only the timed-out stop failure once its actual cleanup succeeds", async () => {
        vi.useFakeTimers();
        const cleanup = deferred();
        const bootstrap = new AppBootstrap([{
            name: "slow-stop", start() {}, stop: () => cleanup.promise,
        }], { stopTimeoutMs: 20 });
        await bootstrap.start();
        const stopping = bootstrap.stop().catch((error: unknown) => error);
        await vi.advanceTimersByTimeAsync(25);
        expect(await stopping).toBeInstanceOf(BootstrapStopError);
        expect(bootstrap.snapshot().failedStops).toEqual(["slow-stop"]);
        cleanup.resolve();
        await vi.advanceTimersByTimeAsync(0);
        expect(bootstrap.snapshot()).toMatchObject({ pending: [], failedStops: [], lateCleanupErrors: 0 });
    });

    it("records the actual reason when an abandoned stop eventually rejects", async () => {
        vi.useFakeTimers();
        const cleanup = deferred();
        const bootstrap = new AppBootstrap([{
            name: "failed-stop", start() {}, stop: () => cleanup.promise,
        }], { stopTimeoutMs: 20 });
        await bootstrap.start();
        const stopping = bootstrap.stop().catch((error: unknown) => error);
        await vi.advanceTimersByTimeAsync(25);
        await stopping;
        cleanup.reject(new Error("late-stop-error"));
        await vi.advanceTimersByTimeAsync(0);
        expect(bootstrap.snapshot()).toMatchObject({ pending: [], failedStops: ["failed-stop"], lateCleanupErrors: 1 });
        expect(bootstrap.snapshot().lateCleanupFailures[0]).toContain("late-stop-error");
    });

    it("does not re-add a timeout failure after cooperative stop already finished on abort", async () => {
        vi.useFakeTimers();
        const bootstrap = new AppBootstrap([{
            name: "cooperative-stop", start() {},
            stop: (context) => new Promise<void>((resolve) => {
                context?.signal.addEventListener("abort", () => resolve(), { once: true });
            }),
        }], { stopTimeoutMs: 20 });
        await bootstrap.start();
        const stopping = bootstrap.stop().catch((error: unknown) => error);
        await vi.advanceTimersByTimeAsync(25);
        expect(await stopping).toBeInstanceOf(BootstrapStopError);
        expect(bootstrap.snapshot()).toMatchObject({ pending: [], failedStops: [], lateCleanupErrors: 0 });
    });

    it("does not let an older stop success erase a newer failed compensation", async () => {
        vi.useFakeTimers();
        const startup = deferred();
        const firstCleanup = deferred();
        let stops = 0;
        const bootstrap = new AppBootstrap([{
            name: "owner", start: () => startup.promise,
            stop() {
                if (++stops === 1) return firstCleanup.promise;
                throw new Error("new cleanup failed");
            },
        }], { stopTimeoutMs: 20 });
        const starting = bootstrap.start().catch((error: unknown) => error);
        const stopping = bootstrap.stop().catch((error: unknown) => error);
        await vi.advanceTimersByTimeAsync(25);
        await starting;
        await stopping;
        startup.resolve();
        await vi.advanceTimersByTimeAsync(0);
        expect(stops).toBe(2);
        firstCleanup.resolve();
        await vi.advanceTimersByTimeAsync(0);
        expect(bootstrap.snapshot()).toMatchObject({ pending: [], failedStops: ["owner"], lateCleanupErrors: 1 });
    });

    it("keeps a timed-out compensation recoverable until its actual result arrives", async () => {
        vi.useFakeTimers();
        const startup = deferred();
        const lateCleanup = deferred();
        let stops = 0;
        const bootstrap = new AppBootstrap([{
            name: "owner", start: () => startup.promise,
            stop: () => ++stops === 1 ? undefined : lateCleanup.promise,
        }], { stopTimeoutMs: 20 });
        const starting = bootstrap.start().catch((error: unknown) => error);
        await bootstrap.stop();
        await starting;
        startup.resolve();
        await vi.advanceTimersByTimeAsync(25);
        expect(bootstrap.snapshot()).toMatchObject({ failedStops: ["owner"], lateCleanupErrors: 0 });
        lateCleanup.resolve();
        await vi.advanceTimersByTimeAsync(0);
        expect(bootstrap.snapshot()).toMatchObject({ pending: [], failedStops: [], lateCleanupErrors: 0 });
    });
});

function deferred() {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
}
