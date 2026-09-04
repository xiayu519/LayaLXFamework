import { describe, expect, it } from "vitest";
import {
    AppBootstrap,
    BootstrapStartError,
    BootstrapStopError,
    type AppService,
} from "../src/framework/bootstrap/AppBootstrap";

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
        expect(events).toEqual(["start:one", "start:two", "stop:one"]);
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

    it("shares an in-flight start and stops after startup completes", async () => {
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
        const stop = bootstrap.stop();

        expect(secondStart).toBe(firstStart);
        expect(bootstrap.state).toBe("starting");
        finishStart();
        await Promise.all([firstStart, secondStart, stop]);

        expect(events).toEqual(["start:slow", "stop:slow"]);
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
});
