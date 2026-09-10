import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BaseGameWindow as WindowType } from "../../src/framework/presentation/ui/BaseGameWindow";

class FakeEvents {
    private readonly listeners = new Map<string, Array<{ caller: unknown; method: () => void }>>();
    on(event: string, caller: unknown, method: () => void): this {
        const entries = this.listeners.get(event) ?? [];
        entries.push({ caller, method });
        this.listeners.set(event, entries);
        return this;
    }
    off(event: string, caller: unknown, method: () => void): this {
        this.listeners.set(event, (this.listeners.get(event) ?? []).filter(entry =>
            entry.caller !== caller || entry.method !== method));
        return this;
    }
    offAll(): void { this.listeners.clear(); }
    event(event: string): void {
        for (const entry of [...this.listeners.get(event) ?? []]) entry.method.call(entry.caller);
    }
    count(event: string): number { return this.listeners.get(event)?.length ?? 0; }
}

class FakeWidget extends FakeEvents {
    destroyed = false;
    visible = true;
    text = "";
    mouseEnabled = true;
    destroy(): void { this.destroyed = true; }
}

class FakeWindow extends FakeWidget {
    contentPane!: FakeWidget;
    isShowing = false;
    show(): void { this.isShowing = true; }
    hide(): void { this.hideImmediately(); }
    hideImmediately(): void {
        if (!this.isShowing) return;
        this.isShowing = false;
        this.onHide();
    }
    protected onHide(): void {}
    override destroy(): void {
        this.hideImmediately();
        this.contentPane.destroy();
        super.destroy();
    }
}

class FakeTimer {
    private readonly queue = new Map<unknown, Set<() => void>>();
    callLater(caller: unknown, method: () => void): void {
        const entries = this.queue.get(caller) ?? new Set<() => void>();
        entries.add(method);
        this.queue.set(caller, entries);
    }
    clearCallLater(caller: unknown, method: () => void): void {
        const entries = this.queue.get(caller);
        entries?.delete(method);
        if (entries?.size === 0) this.queue.delete(caller);
    }
    get pending(): number { return [...this.queue.values()].reduce((sum, entries) => sum + entries.size, 0); }
    flush(): void {
        const queue = [...this.queue].flatMap(([caller, entries]) => [...entries].map(method => ({ caller, method })));
        this.queue.clear();
        for (const { caller, method } of queue) method.call(caller);
    }
    reset(): void { this.queue.clear(); }
}

const timer = new FakeTimer();
vi.stubGlobal("Laya", { EventDispatcher: FakeEvents, GWidget: FakeWidget, GWindow: FakeWindow, timer });
const { UIBindings } = await import("../../src/framework/presentation/ui/UIBindings");
const { RedDotStore } = await import("../../src/framework/presentation/ui/RedDotStore");
const { BaseGameWindow } = await import("../../src/framework/presentation/ui/BaseGameWindow") as { BaseGameWindow: typeof WindowType };

function createBindings(store?: InstanceType<typeof RedDotStore>) {
    const view = new FakeWidget();
    return { view, bindings: new UIBindings(view as unknown as Laya.Sprite, store) };
}
function sourceOf(events: FakeEvents): Laya.EventDispatcher { return events as unknown as Laya.EventDispatcher; }

beforeEach(() => timer.reset());
afterAll(() => vi.unstubAllGlobals());

describe("UIBindings", () => {
    it("supports many consumers and many feature sources without coupling their lifetimes", () => {
        const inventory = new FakeEvents(), delivery = new FakeEvents();
        const first = createBindings(), second = createBindings();
        const firstInventory = vi.fn(), secondInventory = vi.fn(), deliveryRender = vi.fn();
        first.bindings.bindData(sourceOf(inventory), "changed", firstInventory);
        first.bindings.bindData(sourceOf(delivery), "changed", deliveryRender);
        second.bindings.bindData(sourceOf(inventory), "changed", secondInventory);
        delivery.event("changed"); timer.flush();
        expect(deliveryRender).toHaveBeenCalledTimes(2);
        expect(firstInventory).toHaveBeenCalledOnce();
        first.bindings.dispose();
        inventory.event("changed"); timer.flush();
        expect(firstInventory).toHaveBeenCalledOnce();
        expect(secondInventory).toHaveBeenCalledTimes(2);
        expect(delivery.count("changed")).toBe(0);
        second.bindings.dispose();
        expect(inventory.count("changed")).toBe(0);
    });
    it("renders the initial snapshot and coalesces different native events into one latest render", () => {
        const { bindings } = createBindings();
        const source = new FakeEvents();
        let value = 4;
        const values: number[] = [];
        bindings.bindData(sourceOf(source), ["changed", "reset", "changed"], () => values.push(value));
        expect(values).toEqual([4]);
        expect(source.count("changed")).toBe(1);
        value = 5; source.event("changed");
        value = 6; source.event("reset");
        value = 7; source.event("changed");
        expect(values).toEqual([4]);
        expect(timer.pending).toBe(1);
        timer.flush();
        expect(values).toEqual([4, 7]);
        bindings.dispose();
    });

    it("cancels queued work on pause and resumes directly from the latest snapshot", () => {
        const { bindings } = createBindings();
        const source = new FakeEvents();
        let value = 1;
        const values: number[] = [];
        bindings.bindData(sourceOf(source), "changed", () => values.push(value));
        value = 2; source.event("changed");
        bindings.setActive(false);
        expect(timer.pending).toBe(0);
        expect(source.count("changed")).toBe(0);
        value = 3; source.event("changed"); timer.flush();
        expect(values).toEqual([1]);
        bindings.setActive(true);
        bindings.setActive(true);
        expect(values).toEqual([1, 3]);
        expect(source.count("changed")).toBe(1);
        bindings.dispose();
    });

    it("does not attach bindings added during a pause until the view resumes", () => {
        const { bindings } = createBindings();
        const source = new FakeEvents();
        const render = vi.fn();
        bindings.setActive(false);
        bindings.bindData(sourceOf(source), "changed", render);
        expect(source.count("changed")).toBe(0);
        expect(render).not.toHaveBeenCalled();
        bindings.setActive(true);
        expect(render).toHaveBeenCalledOnce();
        bindings.dispose();
    });

    it("independently releases multiple badges subscribed to the same key", () => {
        const store = new RedDotStore();
        store.set("mail/unread", 120);
        const { bindings } = createBindings(store);
        const first = new FakeWidget();
        const second = new FakeWidget();
        const firstText = new FakeWidget();
        const secondText = new FakeWidget();
        const disposeFirst = bindings.bindRedDot(first as unknown as Laya.Sprite, "mail", {
            countText: firstText as unknown as Laya.GTextField,
        });
        bindings.bindRedDot(second as unknown as Laya.Sprite, "mail", {
            countText: secondText as unknown as Laya.GTextField, maxCount: 0,
        });
        expect(firstText.text).toBe("99+");
        expect(secondText.text).toBe("120");
        store.set("mail/unread", 0);
        disposeFirst(); disposeFirst();
        expect(timer.pending).toBe(1);
        timer.flush();
        expect(first.visible).toBe(true);
        expect(second.visible).toBe(false);
        expect(secondText.text).toBe("");
        expect((store as unknown as FakeEvents).count("mail")).toBe(1);
        bindings.dispose();
        expect((store as unknown as FakeEvents).count("mail")).toBe(0);
    });

    it("keeps subscriptions and queued renders bounded after 100 recycled-row rebindings", () => {
        const { bindings } = createBindings();
        const source = new FakeEvents();
        const render = vi.fn();
        let dispose = (): void => {};
        for (let index = 0; index < 100; index++) {
            dispose();
            dispose = bindings.bindData(sourceOf(source), "changed", render);
            source.event("changed");
            expect(source.count("changed")).toBe(1);
            expect(timer.pending).toBe(1);
        }
        bindings.setActive(false);
        bindings.setActive(true);
        expect(render).toHaveBeenCalledTimes(101);
        expect(source.count("changed")).toBe(1);
        bindings.dispose(); bindings.dispose();
        expect(source.count("changed")).toBe(0);
        expect(timer.pending).toBe(0);
        expect(() => bindings.bindData(sourceOf(source), "changed", render)).toThrow("ended");
    });

    it("cleans partial native subscriptions when initial subscription fails", () => {
        const { bindings } = createBindings();
        const source = new FakeEvents();
        const original = source.on;
        source.on = function (event, caller, method) {
            original.call(this, event, caller, method);
            if (event === "bad") throw new Error("subscription failed");
            return this;
        };
        expect(() => bindings.bindData(sourceOf(source), ["good", "bad"], () => {})).toThrow("subscription failed");
        expect(source.count("good")).toBe(0);
        expect(source.count("bad")).toBe(0);
        bindings.dispose();
    });

    it("clears queued notifications when the initial render throws", () => {
        const { bindings } = createBindings();
        const source = new FakeEvents();
        expect(() => bindings.bindData(sourceOf(source), "changed", () => {
            source.event("changed");
            throw new Error("render failed");
        })).toThrow("render failed");
        expect(source.count("changed")).toBe(0);
        expect(timer.pending).toBe(0);
        bindings.setActive(false); bindings.setActive(true);
        bindings.dispose();
    });

    it("disposes before a queued render can write into a destroyed view", () => {
        const { bindings, view } = createBindings();
        const source = new FakeEvents();
        const render = vi.fn();
        bindings.bindData(sourceOf(source), "changed", render);
        source.event("changed");
        view.destroy(); timer.flush();
        expect(render).toHaveBeenCalledOnce();
        expect(source.count("changed")).toBe(0);
        expect(() => bindings.bindData(sourceOf(source), "changed", render)).toThrow("ended");
    });

    it("rejects invalid badge paths without leaving native listeners", () => {
        const store = new RedDotStore();
        const { bindings, view } = createBindings(store);
        expect(() => bindings.bindRedDot(view as unknown as Laya.Sprite, "__proto__")).toThrow("native event name");
        expect((store as unknown as FakeEvents).count("__proto__")).toBe(0);
        bindings.dispose();
    });
});

class BindingWindow extends BaseGameWindow<void> {
    readonly source = new FakeEvents();
    readonly badge = new FakeWidget();
    readonly render = vi.fn();
    fail = false;
    constructor() { super(new FakeWidget() as unknown as Laya.GWidget); }
    protected onBind(): void {
        this.bindData(sourceOf(this.source), "changed", this.render);
        this.bindRedDot(this.badge as unknown as Laya.Sprite, "mail");
        if (this.fail) {
            this.source.event("changed");
            throw new Error("onBind failed");
        }
    }
}

describe("BaseGameWindow presentation bindings", () => {
    it.each(["hide", "hideImmediately", "destroy"] as const)("cleans pending data and red dots on %s", async method => {
        const store = new RedDotStore();
        store.set("mail", 1);
        const window = new BindingWindow();
        window.configureBindings(store);
        await window.present();
        expect(window.badge.visible).toBe(true);
        window.source.event("changed"); store.set("mail", 2);
        expect(timer.pending).toBe(2);
        window[method]();
        expect(timer.pending).toBe(0);
        expect(window.source.count("changed")).toBe(0);
        expect((store as unknown as FakeEvents).count("mail")).toBe(0);
        timer.flush();
        expect(window.render).toHaveBeenCalledOnce();
        expect(store.get("mail")).toBe(2);
        window.destroy();
    });

    it("creates fresh bindings when a hidden window is presented again", async () => {
        const store = new RedDotStore();
        const window = new BindingWindow();
        window.configureBindings(store);
        await window.present();
        window.hide();
        store.set("mail", 3);
        await window.present();
        expect(window.badge.visible).toBe(true);
        expect(window.render).toHaveBeenCalledTimes(2);
        expect(window.source.count("changed")).toBe(1);
        window.destroy();
    });

    it("removes all subscriptions and queued work when onBind fails", async () => {
        const store = new RedDotStore();
        const window = new BindingWindow();
        window.configureBindings(store);
        window.fail = true;
        await expect(window.present()).rejects.toThrow("onBind failed");
        expect(window.source.count("changed")).toBe(0);
        expect((store as unknown as FakeEvents).count("mail")).toBe(0);
        expect(timer.pending).toBe(0);
        expect(window.isShowing).toBe(false);
        window.destroy();
    });
});
