import { describe, expect, it, vi } from "vitest";
import { BaseWorld } from "../../src/framework/application/world/BaseWorld";
import type { WorldContext } from "../../src/framework/application/world/WorldDefinition";
import { WorldRegistry } from "../../src/framework/application/world/WorldRegistry";

describe("class-based World lifecycle", () => {
    it("registers before entering and runs reverse cleanup before the exit hook once", async () => {
        const events: string[] = [];
        class LobbyWorld extends BaseWorld {
            public readonly id = "lobby";
            protected override onRegister(context: WorldContext): void {
                events.push("prepare");
                context.own(() => { events.push("release-resource"); });
            }
            protected override registerEvents(context: WorldContext): void {
                events.push("events");
                context.own(() => { events.push("unregister-events"); });
            }
            protected override registerUI(context: WorldContext): void {
                events.push("ui");
                context.own(() => { events.push("unregister-ui"); });
            }
            protected override registerScenes(context: WorldContext): void {
                events.push("scenes");
                context.own(() => { events.push("unregister-scene"); });
            }
            protected override onEnter(): void { events.push("enter"); }
            protected override onExit(context: WorldContext): void {
                expect(context.signal.aborted).toBe(true);
                events.push("exit");
            }
        }
        const registry = new WorldRegistry();
        registry.register(new LobbyWorld());
        await registry.enter("lobby");
        await Promise.all([registry.exit("lobby"), registry.exit("lobby")]);
        expect(events).toEqual(["prepare", "events", "ui", "scenes", "enter",
            "unregister-scene", "unregister-ui", "unregister-events", "release-resource", "exit"]);
    });

    it("compensates partial registration and can enter the same definition again with a fresh scope", async () => {
        let fail = true, exits = 0, cleanups = 0;
        const contexts: WorldContext[] = [];
        class RetryWorld extends BaseWorld {
            public readonly id = "retry";
            protected override onRegister(context: WorldContext): void {
                contexts.push(context);
                context.own(() => { cleanups++; });
                if (fail) throw new Error("registration failed");
            }
            protected override onEnter(): void {}
            protected override onExit(): void { exits++; }
        }
        const registry = new WorldRegistry();
        registry.register(new RetryWorld());
        await expect(registry.enter("retry")).rejects.toThrow("registration failed");
        expect([exits, cleanups]).toEqual([1, 1]);
        fail = false;
        await registry.enter("retry");
        expect(contexts[1]).not.toBe(contexts[0]);
        expect(contexts[0].signal.aborted).toBe(true);
        expect(contexts[1].signal.aborted).toBe(false);
        await registry.exit("retry");
        expect([exits, cleanups]).toEqual([2, 2]);
    });

    it("skips entry after cancellation and drains registrations completed after exit", async () => {
        let resume!: () => void;
        const pending = new Promise<void>(resolve => { resume = resolve; });
        const events: string[] = [];
        class LoadingWorld extends BaseWorld {
            public readonly id = "loading";
            protected override async registerUI(context: WorldContext): Promise<void> {
                events.push("register");
                await pending;
                context.own(() => { events.push("late-cleanup"); });
            }
            protected override registerScenes(): void { events.push("scenes"); }
            protected override onEnter(): void { events.push("enter"); }
            protected override onExit(): void { events.push("exit"); }
        }
        const registry = new WorldRegistry();
        registry.register(new LoadingWorld());
        const entered = registry.enter("loading");
        await vi.waitFor(() => expect(events).toEqual(["register"]));
        const exited = registry.exit("loading");
        await expect(entered).rejects.toThrow("cancelled");
        resume();
        await exited;
        expect(events).toEqual(["register", "exit", "late-cleanup"]);
        expect(registry.snapshot().pendingLoads).toBe(0);
    });

    it("retains exit-hook failure after owned registrations have been cleaned", async () => {
        let cleaned = false;
        class FailingWorld extends BaseWorld {
            public readonly id = "failing";
            protected override onRegister(context: WorldContext): void {
                context.own(() => { cleaned = true; });
            }
            protected override onEnter(): void {}
            protected override onExit(): void { throw new Error("exit failed"); }
        }
        const registry = new WorldRegistry();
        registry.register(new FailingWorld());
        await registry.enter("failing");
        await expect(registry.exit("failing")).rejects.toThrow("cleanup failed");
        expect(cleaned).toBe(true);
        expect(registry.snapshot().cleanupFailures).toBe(1);
    });

    it.each(["events", "ui", "scenes"])("compensates a failed %s hook without entering later stages", async failed => {
        const completed: string[] = [], cleaned: string[] = [];
        const entered = vi.fn();
        class BrokenWorld extends BaseWorld {
            public readonly id = "broken";
            protected override registerEvents(context: WorldContext): void { this.register("events", context); }
            protected override registerUI(context: WorldContext): void { this.register("ui", context); }
            protected override registerScenes(context: WorldContext): void { this.register("scenes", context); }
            protected override onEnter(): void { entered(); }
            protected override onExit(): void { cleaned.push("exit"); }
            private register(stage: string, context: WorldContext): void {
                completed.push(stage);
                context.own(() => { cleaned.push(stage); });
                if (stage === failed) throw new Error(`${stage} failed`);
            }
        }
        const registry = new WorldRegistry();
        registry.register(new BrokenWorld());
        await expect(registry.enter("broken")).rejects.toThrow(`${failed} failed`);
        const expected = ["events", "ui", "scenes"].slice(0, ["events", "ui", "scenes"].indexOf(failed) + 1);
        expect(completed).toEqual(expected);
        expect(cleaned).toEqual([...expected].reverse().concat("exit"));
        expect(entered).not.toHaveBeenCalled();
        expect(registry.snapshot().pendingLoads).toBe(0);
    });
});
