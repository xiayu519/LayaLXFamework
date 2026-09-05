import { describe, expect, it } from "vitest";
import {
    LifetimeCleanupError,
    LifetimeScope,
} from "../../src/framework/application/lifecycle/LifetimeScope";
import {
    InvalidStateTransitionError,
    StateMachine,
} from "../../src/framework/domain/state/StateMachine";

describe("LifetimeScope", () => {
    it("cleans up once in reverse registration order", () => {
        const events: number[] = [];
        const scope = new LifetimeScope();
        scope.defer(() => events.push(1));
        scope.defer(() => events.push(2));

        scope.dispose();
        scope.dispose();

        expect(events).toEqual([2, 1]);
    });

    it("continues cleanup and reports every error", () => {
        const events: string[] = [];
        const scope = new LifetimeScope();
        scope.defer(() => { events.push("first"); throw new Error("first"); });
        scope.defer(() => { events.push("second"); throw new Error("second"); });

        const error = captureError(() => scope.dispose());

        expect(error).toBeInstanceOf(LifetimeCleanupError);
        expect((error as LifetimeCleanupError).errors).toHaveLength(2);
        expect(events).toEqual(["second", "first"]);
    });
});

describe("StateMachine", () => {
    it("commits deterministic guarded transitions", () => {
        const machine = new StateMachine<"idle" | "running", "start", number>("idle", [
            { from: "idle", event: "start", to: "running", guard: (value) => value > 0 },
        ]);

        expect(machine.can("start", 1)).toBe(true);
        expect(machine.dispatch("start", 1)).toEqual({
            from: "idle",
            event: "start",
            to: "running",
            sequence: 1,
        });
        expect(machine.snapshot()).toEqual({ state: "running", sequence: 1 });
    });

    it("does not commit when an effect fails and rejects invalid transitions", () => {
        const machine = new StateMachine<"idle" | "running", "start", void>("idle", [
            { from: "idle", event: "start", to: "running", effect: () => { throw new Error("failed"); } },
        ]);

        expect(() => machine.dispatch("start", undefined)).toThrow("failed");
        expect(machine.state).toBe("idle");
        expect(() => new StateMachine("idle", []).dispatch("start", undefined))
            .toThrow(InvalidStateTransitionError);
    });
});

function captureError(action: () => void): unknown {
    try {
        action();
        return undefined;
    } catch (error) {
        return error;
    }
}
