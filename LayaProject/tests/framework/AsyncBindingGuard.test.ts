import { describe, expect, it, vi } from "vitest";
import { AsyncBindingGuard } from "../../src/framework/application/ui/AsyncBindingGuard";

describe("AsyncBindingGuard", () => {
    it("allows only the latest binding token to commit", () => {
        const guard = new AsyncBindingGuard();
        const first = guard.next();
        const second = guard.next();
        const action = vi.fn();

        expect(first.commit(action)).toBe(false);
        expect(second.commit(action)).toBe(true);
        expect(action).toHaveBeenCalledOnce();
    });

    it("invalidates on hide and permanently rejects after disposal", () => {
        const guard = new AsyncBindingGuard();
        const token = guard.next();
        guard.invalidate();
        expect(token.isCurrent()).toBe(false);

        guard.dispose();
        expect(() => guard.next()).toThrow("after disposal");
    });

    it("aborts each superseded token and follows an external cancellation signal", () => {
        const guard = new AsyncBindingGuard();
        const first = guard.next();
        const controller = new AbortController();
        const second = guard.next(controller.signal);
        expect(first.signal.aborted).toBe(true);
        expect(second.signal.aborted).toBe(false);
        controller.abort();
        expect(second.signal.aborted).toBe(true);
        expect(second.isCurrent()).toBe(false);
        const third = guard.next();
        guard.dispose();
        expect(third.signal.aborted).toBe(true);
    });
});
