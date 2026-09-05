import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TipQueue } from "../src/framework/presentation/ui/TipQueue";

class FakeGWidget {
    active = true;
    alpha = 1;
    destroyed = false;
    height = 84;
    name = "LXTip";
    parent: FakeRoot | undefined;
    scaleX = 1;
    scaleY = 1;
    visible = true;
    width = 620;
    x = 0;
    y = 0;
    zOrder = 0;
    private readonly children = new Map<string, FakeGWidget>();

    addNamedChild(name: string, child: FakeGWidget): void {
        this.children.set(name, child);
    }

    getChildByName(name: string): FakeGWidget | null {
        return this.children.get(name) ?? null;
    }

    removeSelf(): this {
        this.parent?.removeChild(this);
        this.parent = undefined;
        return this;
    }

    destroy(): void {
        this.destroyed = true;
        this.removeSelf();
    }
}

class FakeTextField extends FakeGWidget {
    text = "";
}

class FakeRoot extends FakeGWidget {
    readonly views: FakeGWidget[] = [];

    addChild<T extends FakeGWidget>(view: T): T {
        view.removeSelf();
        view.parent = this;
        this.views.push(view);
        return view;
    }

    removeChild(view: FakeGWidget): void {
        const index = this.views.indexOf(view);
        if (index >= 0) {
            this.views.splice(index, 1);
        }
    }
}

const timerOwners = new Map<unknown, Set<ReturnType<typeof setTimeout>>>();
const tweenTimers = new Map<unknown, Set<ReturnType<typeof setTimeout>>>();
const root = new FakeRoot();
root.width = 750;
root.height = 1334;

beforeEach(() => {
    vi.useFakeTimers();
    root.views.length = 0;
    timerOwners.clear();
    tweenTimers.clear();
    vi.stubGlobal("Laya", {
        GWidget: FakeGWidget,
        GTextField: FakeTextField,
        GRoot: { inst: root },
        Ease: { sineOut: "sineOut", sineIn: "sineIn" },
        timer: {
            once(delay: number, caller: unknown, method: () => void): void {
                const timer = setTimeout(method.bind(caller), delay);
                const timers = timerOwners.get(caller) ?? new Set();
                timers.add(timer);
                timerOwners.set(caller, timers);
            },
            clearAll(caller: unknown): void {
                for (const timer of timerOwners.get(caller) ?? []) {
                    clearTimeout(timer);
                }
                timerOwners.delete(caller);
            },
        },
        Tween: {
            create(target: Record<string, unknown>) {
                let elapsed = 0;
                let duration = 0;
                const schedule = (callback: () => void) => {
                    const timer = setTimeout(callback, elapsed + duration);
                    const timers = tweenTimers.get(target) ?? new Set();
                    timers.add(timer);
                    tweenTimers.set(target, timers);
                };
                const tween = {
                    delay(value: number) { elapsed += value; return tween; },
                    duration(value: number) { duration = value; return tween; },
                    to(name: string, value: unknown) { schedule(() => { target[name] = value; }); return tween; },
                    ease() { return tween; },
                    then(callback: () => void) { schedule(callback); return tween; },
                };
                return tween;
            },
            killAll(target: unknown): boolean {
                const timers = tweenTimers.get(target);
                for (const timer of timers ?? []) {
                    clearTimeout(timer);
                }
                tweenTimers.delete(target);
                return Boolean(timers?.size);
            },
        },
    });
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("TipQueue", () => {
    it("shows the first tip immediately and dequeues the rest every 500 ms", async () => {
        const pool = createPool();
        const tips = new TipQueue(pool as never, "bootstrap/ui/common/Tip.lh");

        tips.show("first");
        tips.show("second");
        await vi.advanceTimersByTimeAsync(0);
        expect(tips.snapshot()).toMatchObject({ queued: 1, active: 1, shown: 1 });
        expect(root.views[0].getChildByName("messageText")).toMatchObject({ text: "first" });

        await vi.advanceTimersByTimeAsync(499);
        expect(tips.snapshot().shown).toBe(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(tips.snapshot()).toMatchObject({ queued: 0, active: 2, shown: 2 });

        await vi.advanceTimersByTimeAsync(1300);
        expect(tips.snapshot().active).toBe(0);
        expect(pool.idle).toHaveLength(2);
        expect(root.views).toHaveLength(0);

        tips.show("third");
        await vi.advanceTimersByTimeAsync(0);
        expect(tips.snapshot()).toMatchObject({ active: 1, shown: 3 });
        expect(pool.created).toBe(2);
    });

    it("keeps repeated messages and cleans timer, tween and active views", async () => {
        const pool = createPool();
        const tips = new TipQueue(pool as never, "bootstrap/ui/common/Tip.lh");

        tips.show("same");
        tips.show("same");
        await vi.advanceTimersByTimeAsync(0);
        expect(tips.snapshot()).toMatchObject({ queued: 1, active: 1, shown: 1 });

        tips.dispose();
        await tips.waitForPending();
        expect(tips.snapshot().active).toBe(0);
        expect(root.views).toHaveLength(0);
        expect(() => tips.show("late")).toThrow("disposed");
    });
});

function createPool() {
    let definition: {
        onAcquire?(view: FakeGWidget): void;
        onRelease?(view: FakeGWidget): void;
    } | undefined;
    const active = new Set<FakeGWidget>();
    const idle: FakeGWidget[] = [];
    return {
        idle,
        created: 0,
        register(value: typeof definition): void {
            definition = value;
        },
        async acquire(): Promise<FakeGWidget> {
            let view = idle.pop();
            if (!view) {
                view = new FakeGWidget();
                view.addNamedChild("messageText", new FakeTextField());
                this.created += 1;
            }
            active.add(view);
            definition?.onAcquire?.(view);
            return view;
        },
        release(_id: string, view: FakeGWidget): void {
            if (!active.delete(view)) {
                throw new Error("double release");
            }
            definition?.onRelease?.(view);
            idle.push(view);
        },
    };
}
