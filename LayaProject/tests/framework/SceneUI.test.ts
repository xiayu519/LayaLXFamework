import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BindingToken } from "../../src/framework/application/ui/AsyncBindingGuard";
import type { UILayoutService } from "../../src/framework/presentation/ui/UILayoutService";
import type { UIViewRoute, UIViewSession } from "../../src/framework/presentation/ui/UIViewRoute";
import type { UIViewSettings } from "../../src/framework/presentation/ui/UIViewLifecycle";
import { UILayer } from "../../src/framework/presentation/ui/UILayer";

interface FakeComponent {
    onEnable?(): void;
    onDisable?(): void;
    onDestroy?(): void;
}
const pendingComponentDestruction: FakeComponent[] = [];
function flushComponentDestruction(): unknown[] {
    const errors: unknown[] = [];
    for (const component of pendingComponentDestruction.splice(0)) {
        try { component.onDestroy?.(); } catch (error) { errors.push(error); }
    }
    return errors; // ComponentDriver catches each error and continues the remaining callbacks.
}

class FakeWidget {
    name = "";
    mouseEnabled = true;
    graphics = { drawRect() {} };
    readonly components: FakeComponent[] = [];
    addComponent<T extends FakeComponent>(type: new () => T): T {
        const component = new type();
        Object.assign(component, { owner: this });
        this.components.push(component);
        return component;
    }
    getComponent<T extends FakeComponent>(type: new () => T): T | null {
        return this.components.find(component => component instanceof type) as T ?? null;
    }
    destroyed = false;
    private activeValue = true;
    get active(): boolean { return this.activeValue; }
    get activeInHierarchy(): boolean { return this.active && (!this.parent || this.parent.activeInHierarchy); }
    set active(value: boolean) {
        if (value === this.activeValue) return;
        const previous = new Map<FakeWidget, boolean>();
        const capture = (view: FakeWidget): void => {
            previous.set(view, view.activeInHierarchy);
            for (const child of view.children) capture(child);
        };
        capture(this);
        this.activeValue = value;
        for (const [view, wasActive] of previous) {
            if (view.activeInHierarchy === wasActive) continue;
            for (const component of view.components) {
                if (view.activeInHierarchy) component.onEnable?.();
                else component.onDisable?.();
            }
        }
    }
    visible = true;
    zOrder = 0;
    width = 720;
    height = 1280;
    x = 0;
    y = 0;
    parent?: FakeWidget;
    readonly children: FakeWidget[] = [];
    private readonly events = new Map<string, Map<unknown, (...args: unknown[]) => void>>();
    get numChildren(): number { return this.children.length; }
    pos(x: number, y: number): this { this.x = x; this.y = y; return this; }
    size(width: number, height: number): this { this.width = width; this.height = height; return this; }
    addChild(child: FakeWidget): FakeWidget { return this.addChildAt(child, this.children.length); }
    addChildAt(child: FakeWidget, index: number): FakeWidget {
        child.removeSelf();
        this.children.splice(index, 0, child);
        child.parent = this;
        return child;
    }
    removeChild(child: FakeWidget): FakeWidget {
        const index = this.children.indexOf(child);
        if (index >= 0) this.children.splice(index, 1);
        child.parent = undefined;
        return child;
    }
    removeSelf(): this { this.parent?.removeChild(this); return this; }
    getChildIndex(child: FakeWidget): number { return this.children.indexOf(child); }
    setChildIndex(child: FakeWidget, index: number): void {
        this.children.splice(this.getChildIndex(child), 1);
        this.children.splice(index, 0, child);
    }
    setChildIndexBefore(child: FakeWidget, index: number): void {
        this.setChildIndex(child, this.getChildIndex(child) < index ? index - 1 : index);
    }
    on(event: string, caller: unknown, listener: (...args: unknown[]) => void): void {
        if (!this.events.has(event)) this.events.set(event, new Map());
        this.events.get(event)!.set(caller, listener);
    }
    off(event: string, caller: unknown): void { this.events.get(event)?.delete(caller); }
    offAll(): void { this.events.clear(); }
    listenerCount(event: string): number { return this.events.get(event)?.size ?? 0; }
    event(event: string, data: unknown): void {
        for (const [caller, listener] of this.events.get(event) ?? []) listener.call(caller, data);
    }
    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        if (this.active) for (const component of this.components) component.onDisable?.();
        pendingComponentDestruction.push(...this.components);
        this.removeSelf();
        for (const child of [...this.children]) child.destroy();
    }
}

class FakeTimer {
    private readonly queue = new Map<unknown, Map<(...args: unknown[]) => void, unknown[]>>();
    callLater(caller: unknown, callback: (...args: unknown[]) => void, args: unknown[] = []): void {
        const entries = this.queue.get(caller) ?? new Map();
        entries.set(callback, args);
        this.queue.set(caller, entries);
    }
    clearCallLater(caller: unknown, callback: (...args: unknown[]) => void): void {
        const entries = this.queue.get(caller);
        entries?.delete(callback);
        if (entries?.size === 0) this.queue.delete(caller);
    }
    clearAll(caller: unknown): void { this.queue.delete(caller); }
    clear(caller: unknown, callback: (...args: unknown[]) => void): void { this.clearCallLater(caller, callback); }
    get pending(): number { return [...this.queue.values()].reduce((sum, entries) => sum + entries.size, 0); }
    flush(): void {
        const queue = [...this.queue];
        this.queue.clear();
        for (const [caller, entries] of queue) for (const [callback, args] of entries) callback.apply(caller, args);
    }
    reset(): void { this.queue.clear(); }
}

class FakeWindow extends FakeWidget {
    contentPane!: FakeWidget;
    modal = false;
    get isShowing(): boolean { return this.parent === groot; }
    show(): void { groot.addChild(this); groot.adjustModalLayer(); }
    hide(): void {
        if (!this.isShowing) return;
        this.removeSelf();
        this.onHide();
        groot.adjustModalLayer();
    }
    bringToFront(): void { groot.setChildIndex(this, groot.numChildren - 1); }
    protected onHide(): void {}
    override destroy(): void {
        if (this.destroyed) return;
        this.hide();
        this.contentPane?.destroy();
        super.destroy();
    }
}

class FakeRoot extends FakeWidget {
    readonly modalLayer = new FakeWidget();
    adjustModalLayer(): void {
        const modal = [...this.children].reverse().find(child => child instanceof FakeWindow && child.modal);
        if (!modal) { this.modalLayer.removeSelf(); return; }
        if (this.modalLayer.parent) this.setChildIndexBefore(this.modalLayer, this.getChildIndex(modal));
        else this.addChildAt(this.modalLayer, this.getChildIndex(modal));
    }
}

class FakePrefab {
    readonly create: () => Laya.GWidget;
    constructor(create: () => Laya.GWidget) { this.create = vi.fn(create); }
}

class FakeLayout {
    readonly listeners = new Set<() => void>();
    readonly applyView = vi.fn();
    readonly apply = vi.fn();
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        listener();
        return () => this.listeners.delete(listener);
    }
    snapshot() { return { viewport: { x: 0, y: 0, width: 720, height: 1280 } }; }
    resize(): void { for (const listener of this.listeners) listener(); }
}

const groot = new FakeRoot();
const load = vi.fn();
const timer = new FakeTimer();
const prefabSettings = new Map<string, Partial<UIViewSettings>>();
vi.stubGlobal("Laya", {
    EventDispatcher: FakeWidget,
    regClass: () => () => {}, property: () => () => {},
    Sprite: FakeWidget, Script: class { enabled = true; }, UIConfig2: { modalLayerColor: "#00000088" }, GWidget: FakeWidget, GWindow: FakeWindow, GRoot: { inst: groot }, Prefab: FakePrefab,
    Event: { CLICK: "click" }, Loader: { HIERARCHY: "HIERARCHY" }, loader: { load },
    timer,
});

const { UIRouter } = await import("../../src/framework/presentation/ui/UIRouter");
const { BaseGameWindow } = await import("../../src/framework/presentation/ui/BaseGameWindow");
const { RedDotStore } = await import("../../src/framework/presentation/ui/RedDotStore");
const { UIViewLifecycle } = await import("../../src/framework/presentation/ui/UIViewLifecycle");
class TestView extends Laya.GWidget {
    value = "";
    constructor() { super(); this.addComponent(UIViewLifecycle); } // Simulates the authored prefab component.
}
class TestWindow extends BaseGameWindow<string> {
    value = "";
    constructor(content: Laya.GWidget) { super(content); }
    protected onBind(args: string, _token: BindingToken): void { this.value = args; }
}

beforeEach(() => {
    timer.reset();
    prefabSettings.clear();
    load.mockReset().mockImplementation((url: string) => Promise.resolve(new FakePrefab(() => {
        const view = new TestView();
        Object.assign(view.getComponent(UIViewLifecycle)!, prefabSettings.get(url));
        return view;
    })));
    for (const child of [...groot.children]) child.destroy();
    groot.modalLayer.removeSelf();
});
afterEach(() => { flushComponentDestruction(); });
afterAll(() => vi.unstubAllGlobals());

describe("SceneUI", () => {
    it("uses the authored Runtime and component settings without importing its class in the route", async () => {
        class NativeView extends TestView {
            onBind(args: string, session: UIViewSession): void {
                this.value = args;
                session.lifetime.defer(() => { this.value = "closed"; });
            }
        }
        const { router, layout } = createRouter();
        const route = router.registerView<string, NativeView>({ id: "native", url: "ui/native.lh" });
        expect(load).not.toHaveBeenCalled();
        const view = new NativeView();
        Object.assign(view.getComponent(UIViewLifecycle)!, {
            layer: UILayer.HUD, navigation: "overlay", modal: true, closeOnMaskClick: false, retention: "hide",
        });
        load.mockResolvedValueOnce(new FakePrefab(() => view));
        const scope = router.createSceneUI(new TestView());
        expect(await scope.show(route, "native-bound")).toBe(view);
        expect(view.value).toBe("native-bound");
        expect(view.zOrder).toBe(UILayer.HUD * 1000);
        expect(layout.applyView).toHaveBeenCalledWith(view, "fullscreen", false, undefined);
        scope.modalLayer!.event("click", { stopPropagation() {} });
        expect(view.parent).toBe(scope.root);
        scope.close(route.id);
        expect(view.value).toBe("closed");
        expect(view.destroyed).toBe(false);
        expect(await scope.show(route, "again")).toBe(view);
        expect(view.value).toBe("again");
        router.dispose();
    });

    it("rejects an authored Runtime missing onBind and destroys its instance", async () => {
        const { router } = createRouter();
        const route = router.registerView({ id: "missing-bind", url: "ui/missing-bind.lh" });
        const view = new TestView();
        load.mockResolvedValueOnce(new FakePrefab(() => view));
        const scope = router.createSceneUI(new TestView());
        await expect(scope.show(route, undefined)).rejects.toThrow("Runtime must implement onBind");
        expect(view.destroyed).toBe(true);
        expect(scope.snapshot().views).toHaveLength(0);
        router.dispose();
    });

    it.each([
        { multiplicity: "multiple", retention: "hide" },
        { layer: 99 }, { layout: "bad-layout" }, { modal: "true" },
    ])("rejects invalid authored settings %j without retaining the view", async settings => {
        const { router } = createRouter();
        const route = router.registerView(viewRoute("invalid"));
        const view = new TestView();
        Object.assign(view.getComponent(UIViewLifecycle)!, settings);
        load.mockResolvedValueOnce(new FakePrefab(() => view));
        const scope = router.createSceneUI(new TestView());
        await expect(scope.show(route, "bad")).rejects.toThrow("UIViewLifecycle");
        expect(view.destroyed).toBe(true);
        expect(scope.snapshot().views).toHaveLength(0);
        router.dispose();
    });

    it.each(["singleton", "multiple"] as const)("discovers %s multiplicity before deciding concurrent first opens", async multiplicity => {
        const { router } = createRouter();
        const bind = vi.fn((view: TestView, args: string) => { view.value = args; });
        const route = router.registerView(viewRoute("concurrent", bind));
        const waiting = deferred<FakePrefab>();
        load.mockReturnValue(waiting.promise); // Native Loader coalesces requests for the same resource.
        const prefab = new FakePrefab(() => {
            const view = new TestView();
            view.getComponent(UIViewLifecycle)!.multiplicity = multiplicity;
            return view;
        });
        const scope = router.createSceneUI(new TestView());
        const first = scope.show(route, "first");
        const firstResult = first.then(view => view, error => error as Error);
        const second = scope.show(route, "second");
        expect(scope.snapshot().pendingRequests).toHaveLength(2);
        expect(prefab.create).not.toHaveBeenCalled();
        waiting.resolve(prefab);
        const latest = await second;
        const previous = await firstResult;
        expect(latest.value).toBe("second");
        if (multiplicity === "singleton") {
            expect(previous).toBeInstanceOf(Error);
            expect(bind.mock.calls.map(call => call[1])).toEqual(["second"]);
            expect(prefab.create).toHaveBeenCalledOnce();
        } else {
            expect(previous).toBeInstanceOf(TestView);
            expect(previous).not.toBe(latest);
            expect(bind.mock.calls.map(call => call[1])).toEqual(["first", "second"]);
            expect(prefab.create).toHaveBeenCalledTimes(2);
        }
        router.dispose();
    });

    it("keeps another first-open waiter alive when one caller cancels before metadata is loaded", async () => {
        const { router } = createRouter();
        const route = router.registerView(viewRoute("shared"));
        const waiting = deferred<FakePrefab>();
        load.mockReturnValue(waiting.promise);
        const scope = router.createSceneUI(new TestView());
        const abort = new AbortController();
        const cancelled = expect(scope.show(route, "cancelled", { signal: abort.signal })).rejects.toThrow("cancelled");
        const surviving = scope.show(route, "surviving");
        abort.abort();
        await cancelled;
        const prefab = new FakePrefab(() => new TestView());
        waiting.resolve(prefab);
        expect((await surviving).value).toBe("surviving");
        expect(prefab.create).toHaveBeenCalledOnce();
        router.dispose();
    });

    it("releases a discovered singleton if its newer consumer cancels before consuming it", async () => {
        const { router } = createRouter();
        const route = router.registerView(viewRoute("abandoned-discovery"));
        const firstLoad = deferred<FakePrefab>();
        const secondLoad = deferred<FakePrefab>();
        load.mockReturnValueOnce(firstLoad.promise).mockReturnValueOnce(secondLoad.promise);
        const scope = router.createSceneUI(new TestView());
        const firstRejected = expect(scope.show(route, "first")).rejects.toThrow("cancelled");
        const abort = new AbortController();
        const secondRejected = expect(scope.show(route, "second", { signal: abort.signal })).rejects.toThrow("cancelled");
        const view = new TestView();
        firstLoad.resolve(new FakePrefab(() => view));
        await firstRejected;
        expect(view.destroyed).toBe(false);
        abort.abort();
        await secondRejected;
        expect(view.destroyed).toBe(true);
        expect(scope.snapshot().views).toHaveLength(0);
        const late = new FakePrefab(() => new TestView());
        secondLoad.resolve(late);
        await scope.waitForPendingLoads();
        expect(late.create).not.toHaveBeenCalled();
        router.dispose();
    });

    it("unregisters live, retained and binding views across scenes while preserving unrelated work", async () => {
        const { router } = createRouter();
        const pendingBind = deferred<void>();
        const otherBind = deferred<void>();
        const route = router.registerView(configured(viewRoute("world-ui", (_view, args) => {
            if (args === "pending") return pendingBind.promise;
        }), { retention: "hide" }));
        const other = router.registerView(viewRoute("other-world", () => otherBind.promise));
        const scopes = [0, 1, 2, 3].map(() => router.createSceneUI(new TestView()));
        const live = await scopes[0].show(route, "live");
        const hidden = await scopes[1].show(route, "cached");
        scopes[1].close(route.id);
        const opening = scopes[2].show(route, "pending");
        const rejected = expect(opening).rejects.toThrow("cancelled");
        const unrelated = scopes[3].show(other, "other");
        for (let i = 0; i < 12; i++) await Promise.resolve();
        expect(scopes[2].snapshot().pendingRequests[0].phase).toBe("binding");
        let drained = false;
        const unregister = router.unregisterView(route).then(() => { drained = true; });
        expect(() => scopes[0].show(route, "blocked")).toThrow("Unknown native UI route");
        expect(() => router.registerView(viewRoute(route.id))).toThrow("Duplicate");
        expect(live.destroyed).toBe(true);
        expect(hidden.destroyed).toBe(true);
        expect(scopes.every(scope => !scope.root.destroyed)).toBe(true);
        await rejected;
        expect(drained).toBe(false);
        pendingBind.resolve();
        await unregister;
        expect(drained).toBe(true);
        expect(scopes[3].snapshot().pendingRequests).toHaveLength(1);
        otherBind.resolve();
        expect((await unrelated).destroyed).toBe(false);
        const replacement = router.registerView(viewRoute(route.id));
        await router.unregisterView(route); // Old World cleanup cannot remove the replacement.
        expect((await scopes[0].show(replacement, "replacement")).value).toBe("replacement");
        router.dispose();
    });

    it("drains a removed parent's child loading without unregistering the child's shared definition", async () => {
        const { router } = createRouter();
        let session!: UIViewSession;
        const parent = router.registerView(viewRoute("parent-unregister", (_view, _args, current) => { session = current; }));
        const child = router.registerView(popupRoute("shared-child"));
        const scope = router.createSceneUI(new TestView());
        await scope.show(parent, "parent");
        const waiting = deferred<FakePrefab>();
        load.mockReturnValueOnce(waiting.promise);
        const rejected = expect(session.show(child, "late")).rejects.toThrow("cancelled");
        let drained = false;
        const removed = router.unregisterView(parent).then(() => { drained = true; });
        await rejected;
        expect(drained).toBe(false);
        const latePrefab = new FakePrefab(() => new TestView());
        waiting.resolve(latePrefab);
        await removed;
        expect(latePrefab.create).not.toHaveBeenCalled();
        expect((await scope.show(child, "independent")).value).toBe("independent");
        router.dispose();
    });

    it("waits for a removed route's native load and never instantiates its late prefab", async () => {
        const { router } = createRouter();
        const route = router.registerView(viewRoute("pending-unregister"));
        const scope = router.createSceneUI(new TestView());
        const waiting = deferred<FakePrefab>();
        load.mockReturnValueOnce(waiting.promise);
        const rejected = expect(scope.show(route, "late")).rejects.toThrow("cancelled");
        let drained = false;
        const removed = router.unregisterView(route.id).then(() => { drained = true; });
        await rejected;
        expect(drained).toBe(false);
        const latePrefab = new FakePrefab(() => new TestView());
        waiting.resolve(latePrefab);
        await removed;
        expect(latePrefab.create).not.toHaveBeenCalled();
        expect(scope.snapshot().views).toHaveLength(0);
        router.dispose();
    });

    it("tracks a cached Runtime binding before it synchronously unregisters its own route", async () => {
        const { router } = createRouter();
        const late = deferred<void>();
        let removed: Promise<void> | undefined;
        let drained = false;
        const route = router.registerView(configured(viewRoute("reentrant-unregister", (_view, args) => {
            if (args === "remove") {
                removed = router.unregisterView(route).then(() => { drained = true; });
                return late.promise;
            }
        }), { retention: "hide" }));
        const scope = router.createSceneUI(new TestView());
        const view = await scope.show(route, "first");
        scope.close(route.id);
        await expect(scope.show(route, "remove")).rejects.toThrow("cancelled");
        expect(view.destroyed).toBe(true);
        expect(drained).toBe(false);
        late.resolve();
        await removed;
        expect(drained).toBe(true);
        router.dispose();
    });

    it("continues unregistering other scenes after destruction fails and supports cleanup retry", async () => {
        class RetryView extends TestView {
            attempts = 0;
            override destroy(): void {
                if (++this.attempts === 1) throw new Error("native destruction failed");
                super.destroy();
            }
        }
        const { router } = createRouter();
        const route = router.registerView(viewRoute("retry-unregister"));
        const scopes = [router.createSceneUI(new TestView()), router.createSceneUI(new TestView())];
        const bad = new RetryView();
        load.mockResolvedValueOnce(new FakePrefab(() => bad));
        await scopes[0].show(route, "bad");
        const good = await scopes[1].show(route, "good");
        await expect(router.unregisterView(route)).rejects.toThrow("cleanup");
        expect(bad.destroyed).toBe(false);
        expect(good.destroyed).toBe(true);
        expect(() => scopes[1].show(route, "blocked")).toThrow("Unknown native UI route");
        await router.unregisterView(route);
        expect(bad.destroyed).toBe(true);
        expect(scopes[0].snapshot().views).toHaveLength(0);
        router.registerView(viewRoute(route.id));
        router.dispose();
    });

    it("destroys a prefab whose native construction synchronously disposes its scene owner", async () => {
        const { router } = createRouter();
        const scope = router.createSceneUI(new TestView());
        const bind = vi.fn();
        const route = router.registerView(viewRoute("construction-exit", bind));
        const view = new TestView();
        load.mockResolvedValueOnce(new FakePrefab(() => { scope.dispose(); return view; }));
        await expect(scope.show(route, "late")).rejects.toThrow("cancelled");
        expect(view.destroyed).toBe(true);
        expect(bind).not.toHaveBeenCalled();
        expect(scope.snapshot().views).toHaveLength(0);
        router.dispose();
    });

    it.each(["missing", "disabled"])("rejects a %s prefab lifecycle component without adding one at runtime", async kind => {
        const { router } = createRouter();
        const scope = router.createSceneUI(new TestView());
        const route = router.registerView({ ...viewRoute("malformed"), bind: vi.fn() });
        const view = kind === "missing" ? new Laya.GWidget() : new TestView();
        if (kind === "disabled") view.getComponent(UIViewLifecycle)!.enabled = false;
        const add = vi.spyOn(view, "addComponent");
        load.mockResolvedValueOnce(new FakePrefab(() => view));
        await expect(scope.show(route, "bad")).rejects.toThrow("requires an enabled UIViewLifecycle");
        expect(add).not.toHaveBeenCalled();
        expect(route.bind).not.toHaveBeenCalled();
        expect(view.destroyed).toBe(true);
        expect(scope.snapshot().views).toHaveLength(0);
        router.dispose();
    });

    it("reuses the authored lifecycle component across retained presentations", async () => {
        const { router } = createRouter();
        const scope = router.createSceneUI(new TestView());
        const route = router.registerView(configured(viewRoute("static"), { retention: "hide" }));
        const view = new TestView();
        const observer = view.getComponent(UIViewLifecycle);
        observer!.retention = "hide";
        const add = vi.spyOn(view, "addComponent");
        load.mockResolvedValueOnce(new FakePrefab(() => view));
        expect(await scope.show(route, "first")).toBe(view);
        scope.close(route.id);
        expect(await scope.show(route, "second")).toBe(view);
        expect(view.getComponent(UIViewLifecycle)).toBe(observer);
        expect(add).not.toHaveBeenCalled();
        router.dispose();
    });

    it("evicts only closed cached views, leaving live and pending presentations intact", async () => {
        const { router } = createRouter();
        const scope = router.createSceneUI(new TestView());
        const route = router.registerView(configured(viewRoute("cached"), { retention: "hide" as const }));
        const view = await scope.show(route, "visible");
        scope.releaseCached();
        expect(view.destroyed).toBe(false);
        scope.close(route.id);
        expect(view.destroyed).toBe(false);
        scope.releaseCached(route.id);
        expect(view.destroyed).toBe(true);
        expect(scope.snapshot().views).toHaveLength(0);
        await router.dispose();
    });
    it("attaches native views to the given scene root and scopes singleton popups independently", async () => {
        const { router, layout } = createRouter();
        const page = router.registerView(viewRoute("page"));
        const popup = router.registerView(popupRoute("confirm"));
        const leftRoot = new TestView();
        const rightRoot = new TestView();
        const left = router.createSceneUI(leftRoot);
        const right = router.createSceneUI(rightRoot);
        const leftPage = await left.show(page, "left");
        const rightPage = await right.show(page, "right");
        expect(leftPage).not.toBe(rightPage);
        expect(leftPage.parent).toBe(leftRoot);
        expect(rightPage.parent).toBe(rightRoot);
        expect(groot.children).not.toContain(leftPage);
        const leftPopup = await left.show(popup, "left");
        const rightPopup = await right.show(popup, "right");
        expect(leftPopup).not.toBe(rightPopup);
        expect(leftPopup.parent).toBe(leftRoot);
        expect(rightPopup.parent).toBe(rightRoot);
        expect(router.snapshot().managed).toHaveLength(0);
        expect(router.snapshot().scenes).toHaveLength(2);
        left.dispose();
        expect(leftPage.destroyed).toBe(true);
        expect(leftPopup.destroyed).toBe(true);
        expect(rightPopup.destroyed).toBe(false);
        expect(rightPage.destroyed).toBe(false);
        expect(leftRoot.destroyed).toBe(false);
        router.dispose();
        await router.waitForPendingLoads();
        expect(rightPage.destroyed).toBe(true);
        expect(rightPopup.destroyed).toBe(true);
        expect(layout.listeners.size).toBe(0);
    });

    it("reuses hidden views and windows within the scene but destroys both on exit", async () => {
        const { router } = createRouter();
        const cleaned = vi.fn();
        const page = router.registerView(configured(viewRoute("page", (view, args, session) => {
            view.value = args;
            session.lifetime.defer(cleaned);
        }), { retention: "hide" }));
        const popup = router.registerView(configured(popupRoute("confirm"), { retention: "hide" }));
        const scene = router.createSceneUI(new TestView());
        const firstPage = await scene.show(page, "first");
        const firstPopup = await scene.show(popup, "first");
        scene.close(page.id);
        scene.close(popup.id);
        expect(firstPage.parent).toBeUndefined();
        expect(firstPage.destroyed).toBe(false);
        expect(firstPopup.parent).toBeUndefined();
        expect(cleaned).toHaveBeenCalledOnce();
        expect(await scene.show(page, "second")).toBe(firstPage);
        expect(await scene.show(popup, "second")).toBe(firstPopup);
        expect(firstPage.value).toBe("second");
        scene.close(page.id);
        scene.close(popup.id);
        scene.dispose();
        expect(firstPage.destroyed).toBe(true);
        expect(firstPopup.destroyed).toBe(true);
        expect(cleaned).toHaveBeenCalledTimes(2);
        expect(scene.snapshot().views).toHaveLength(0);
        expect(() => scene.show(page, "late")).toThrow("disposed");
        router.dispose();
    });

    it.each(["view", "popup"] as const)("cancels pending %s loads and waits without creating late nodes", async kind => {
        const { router } = createRouter();
        const route = kind === "view"
            ? router.registerView(viewRoute("pending")) : router.registerView(popupRoute("pending"));
        const delayed = deferred<FakePrefab>();
        load.mockReturnValue(delayed.promise);
        const root = new TestView();
        const scene = router.createSceneUI(root);
        const result = scene.show(route.id, "late");
        const cancelled = expect(result).rejects.toThrow("cancelled");
        scene.dispose();
        await cancelled;
        let finished = false;
        const drain = scene.waitForPendingLoads().then(() => { finished = true; });
        await Promise.resolve();
        expect(finished).toBe(false);
        const prefab = new FakePrefab(() => new TestView());
        delayed.resolve(prefab);
        await drain;
        expect(prefab.create).not.toHaveBeenCalled();
        expect(root.numChildren).toBe(0);
        expect(groot.children).toHaveLength(0);
        expect(scene.snapshot().pendingRequests).toHaveLength(0);
        router.dispose();
    });

    it("keeps a newer view binding when an older asynchronous binding resolves late", async () => {
        const { router } = createRouter();
        const oldResult = deferred<void>();
        const entered = deferred<void>();
        const oldCleanup = vi.fn();
        const nextCleanup = vi.fn();
        let oldSession: UIViewSession | undefined;
        const route = router.registerView(viewRoute("page", async (view, args, session) => {
            if (args === "old") {
                oldSession = session;
                session.lifetime.defer(oldCleanup);
                entered.resolve();
                await oldResult.promise;
            } else session.lifetime.defer(nextCleanup);
            session.token.commit(() => { view.value = args; });
        }));
        const root = new TestView();
        const scene = router.createSceneUI(root);
        const old = scene.show(route, "old");
        const rejected = expect(old).rejects.toThrow("cancelled");
        await entered.promise;
        const current = await scene.show(route, "new");
        await rejected;
        expect(oldCleanup).toHaveBeenCalledOnce();
        expect(current.value).toBe("new");
        oldResult.resolve();
        await Promise.resolve();
        oldSession!.close();
        expect(current.value).toBe("new");
        expect(current.destroyed).toBe(false);
        expect(current.parent).toBe(root);
        scene.dispose();
        expect(nextCleanup).toHaveBeenCalledOnce();
        router.dispose();
    });

    it("cancels in-flight bindings during disposal and prevents subsequent commits", async () => {
        const { router } = createRouter();
        const entered = deferred<void>();
        const delayed = deferred<void>();
        const cleanup = vi.fn();
        let view: TestView | undefined;
        let committed: boolean | undefined;
        const route = router.registerView(viewRoute("page", async (target, _args, session) => {
            view = target;
            session.lifetime.defer(cleanup);
            entered.resolve();
            await delayed.promise;
            committed = session.token.commit(() => { target.value = "late"; });
        }));
        const scene = router.createSceneUI(new TestView());
        const showing = scene.show(route, "old");
        const rejection = expect(showing).rejects.toThrow("cancelled");
        await entered.promise;
        scene.dispose();
        await rejection;
        expect(view!.destroyed).toBe(true);
        expect(cleanup).toHaveBeenCalledOnce();
        let drained = false;
        const draining = router.waitForPendingLoads().then(() => { drained = true; });
        await Promise.resolve();
        expect(drained).toBe(false);
        delayed.resolve();
        await draining;
        expect(committed).toBe(false);
        router.dispose();
    });

    it("cleans both visible and retained layout subscriptions when the scope is disposed", async () => {
        const { router, layout } = createRouter();
        const route = router.registerView(configured(viewRoute("page"), { retention: "hide" }));
        const scene = router.createSceneUI(new TestView());
        const view = await scene.show(route, "value");
        scene.close(route.id);
        layout.applyView.mockClear();
        layout.resize();
        expect(layout.applyView).toHaveBeenCalledWith(view, "fullscreen", false, undefined);
        scene.dispose();
        layout.applyView.mockClear();
        layout.resize();
        expect(layout.applyView).not.toHaveBeenCalled();
        expect(layout.listeners.size).toBe(1);
        router.dispose();
        expect(layout.listeners.size).toBe(0);
    });

    it("surfaces failed cleanup while destroying other owners and retaining diagnostics", async () => {
        const { router, layout } = createRouter();
        const route = router.registerView(viewRoute("bad", (_view, _args, session) => {
            session.lifetime.defer(() => { throw new Error("cleanup failed"); });
        }));
        const good = router.registerView(viewRoute("good"));
        const scene = router.createSceneUI(new TestView());
        const badView = await scene.show(route, "bad");
        const goodView = await scene.show(good, "good");
        expect(() => scene.dispose()).toThrow();
        expect(badView.destroyed).toBe(true);
        expect(goodView.destroyed).toBe(true);
        expect(scene.snapshot().views).toEqual([expect.objectContaining({ routeId: "bad", cleanupFailed: true })]);
        expect(layout.listeners.size).toBe(1);
        expect(() => router.dispose()).toThrow();
        expect(layout.listeners.size).toBe(0);
    });

    it("routes the shared native mask to the top scene window without closing another scene", async () => {
        const { router } = createRouter();
        const popup = router.registerView(popupRoute("confirm"));
        const left = router.createSceneUI(new TestView());
        const right = router.createSceneUI(new TestView());
        const lower = await left.show(popup, "left");
        const upper = await right.show(popup, "right");
        const event = { stopPropagation: vi.fn() };
        right.modalLayer!.event("click", event);
        expect(upper.destroyed).toBe(true);
        expect(lower.destroyed).toBe(false);
        expect(event.stopPropagation).toHaveBeenCalledOnce();
        router.dispose();
    });

    it("pauses covered Screen pages and restores their state while leaving HUD active", async () => {
        const { router } = createRouter();
        const bindFirst = vi.fn((view: TestView, args: string) => { view.value = args; });
        const first = router.registerView(viewRoute("first", bindFirst));
        const second = router.registerView(viewRoute("second"));
        const hud = router.registerView(configured(viewRoute("hud"), { layer: UILayer.HUD }));
        const root = new TestView();
        const scene = router.createSceneUI(root);
        const firstView = await scene.show(first, "selection=42");
        const hudView = await scene.show(hud, "health=100");
        const secondView = await scene.show(second, "inventory");
        expect(firstView.active).toBe(false);
        expect(firstView.parent).toBe(root);
        expect(hudView.active).toBe(true);
        expect(secondView.active).toBe(true);
        expect(scene.snapshot().views.filter(view => view.visible).map(view => view.routeId)).toEqual(["second", "hud"]);
        scene.close(second.id);
        expect(secondView.destroyed).toBe(true);
        expect(firstView.active).toBe(true);
        expect(firstView.value).toBe("selection=42");
        expect(bindFirst).toHaveBeenCalledOnce();
        expect(hudView.active).toBe(true);
        router.dispose();
    });

    it("ignores mask input for a disposed scope whose failed window still awaits cleanup", async () => {
        class RetryWindow extends TestView {
            attempts = 0;
            override destroy(): void {
                if (++this.attempts === 1) throw new Error("native destruction failed");
                super.destroy();
            }
        }
        const { router } = createRouter();
        const route = router.registerView(popupRoute("failed"));
        load.mockResolvedValue(new FakePrefab(() => new RetryWindow()));
        const scene = router.createSceneUI(new TestView());
        const window = await scene.show(route, "value");
        expect(() => scene.dispose()).toThrow();
        expect(window.parent).toBe(scene.root);
        expect(scene.modalLayer).toBeUndefined();
        scene.dispose();
        expect(window.destroyed).toBe(true);
        router.dispose();
    });

    it("releases scope registries, retained windows and layout listeners across repeated scene cycles", async () => {
        const { router, layout } = createRouter();
        const page = router.registerView(configured(viewRoute("page"), { retention: "hide" }));
        const popup = router.registerView(configured(popupRoute("popup"), { retention: "hide" }));
        for (let index = 0; index < 20; index += 1) {
            const root = new TestView();
            const scene = router.createSceneUI(root);
            await scene.show(page, String(index));
            await scene.show(popup, String(index));
            scene.close(page.id);
            scene.close(popup.id);
            scene.dispose();
            await router.waitForPendingLoads();
            expect(router.snapshot().scenes).toHaveLength(0);
            expect(root.numChildren).toBe(0);
            expect(groot.numChildren).toBe(0);
            expect(layout.listeners.size).toBe(1);
        }
        router.dispose();
        expect(layout.listeners.size).toBe(0);
    });
});

describe("SceneUI owner and cleanup boundaries", () => {
    it("cancels child loading when its parent closes and rejects the old session after reopen", async () => {
        const { router } = createRouter();
        const sessions: UIViewSession[] = [];
        const parent = router.registerView(configured(viewRoute("parent", (_view, _args, session) => { sessions.push(session); }), { retention: "hide" }));
        const child = router.registerView(popupRoute("child"));
        const scene = router.createSceneUI(new TestView());
        const view = await scene.show(parent, "first");
        const delayed = deferred<FakePrefab>();
        load.mockReturnValueOnce(delayed.promise);
        const loading = sessions[0].show(child, "late");
        const cancelled = expect(loading).rejects.toThrow("cancelled");
        scene.close(parent.id);
        await cancelled;
        expect(await scene.show(parent, "second")).toBe(view);
        expect(sessions[0].token.isCurrent()).toBe(false);
        await expect(sessions[0].show(child, "stale")).rejects.toThrow("cancelled");
        sessions[0].close();
        expect(view.parent).toBe(scene.root);
        const latePrefab = new FakePrefab(() => new TestView());
        delayed.resolve(latePrefab);
        await scene.waitForPendingLoads();
        expect(latePrefab.create).not.toHaveBeenCalled();
        const currentChild = await sessions[1].show(child, "current");
        expect(currentChild.parent).toBe(scene.root);
        scene.close(parent.id);
        expect(currentChild.destroyed).toBe(true);
        expect(scene.snapshot().pendingRequests).toHaveLength(0);
        router.dispose();
    });

    it("destroys existing children and cancels pending children when a visible parent is rebound", async () => {
        const { router } = createRouter();
        const sessions: UIViewSession[] = [];
        const parent = router.registerView(viewRoute("parent", (_view, _args, session) => { sessions.push(session); }));
        const child = router.registerView(popupRoute("child"));
        const pendingChild = router.registerView(popupRoute("pending-child"));
        const scene = router.createSceneUI(new TestView());
        const first = await scene.show(parent, "first");
        const attached = await sessions[0].show(child, "old");
        const delayed = deferred<FakePrefab>();
        load.mockReturnValueOnce(delayed.promise);
        const loading = sessions[0].show(pendingChild, "old");
        const cancelled = expect(loading).rejects.toThrow("cancelled");
        expect(await scene.show(parent, "second")).toBe(first);
        await cancelled;
        expect(attached.destroyed).toBe(true);
        expect(sessions[0].token.commit(() => { first.value = "stale"; })).toBe(false);
        const latePrefab = new FakePrefab(() => new TestView());
        delayed.resolve(latePrefab);
        await scene.waitForPendingLoads();
        expect(latePrefab.create).not.toHaveBeenCalled();
        const current = await sessions[1].show(child, "new");
        sessions[0].close();
        expect(current.destroyed).toBe(false);
        router.dispose();
    });

    it("reuses singleton children within one owner and isolates the same route across owners", async () => {
        const { router } = createRouter();
        const sessions = new Map<string, UIViewSession>();
        const parent = router.registerView(configured(viewRoute("parent", (_view, args, session) => { sessions.set(args, session); }), { multiplicity: "multiple" }));
        const child = router.registerView(popupRoute("child"));
        const scene = router.createSceneUI(new TestView());
        const first = await scene.show(parent, "a");
        const second = await scene.show(parent, "b");
        const firstChild = await sessions.get("a")!.show(child, "a-1");
        expect(await sessions.get("a")!.show(child, "a-2")).toBe(firstChild);
        const secondChild = await sessions.get("b")!.show(child, "b");
        const sceneChild = await scene.show(child, "scene");
        expect(new Set([firstChild, secondChild, sceneChild]).size).toBe(3);
        expect(scene.snapshot().views.filter(item => item.routeId === child.id).map(item => item.owner))
            .toEqual(expect.arrayContaining([first, second, scene.root]));
        scene.close(parent.id, first);
        expect(firstChild.destroyed).toBe(true);
        expect(secondChild.destroyed).toBe(false);
        expect(sceneChild.destroyed).toBe(false);
        scene.close(child.id);
        expect(sceneChild.destroyed).toBe(true);
        expect(secondChild.destroyed).toBe(false);
        router.dispose();
    });

    it("pauses all subscriptions of a covered page and restores same-key badges from the latest snapshot", async () => {
        const store = new RedDotStore();
        store.set("mail", 4);
        const { router } = createRouter(store);
        const badges = [new FakeWidget(), new FakeWidget()];
        const texts = [{ text: "", destroyed: false }, { text: "", destroyed: false }];
        let detachFirst = (): void => {};
        const render = vi.fn();
        const first = router.registerView(viewRoute("first", (view, _args, session) => {
            session.bindData(store, "mail", () => { render(); view.value = String(store.get("mail")); });
            detachFirst = session.bindRedDot(badges[0] as unknown as Laya.Sprite, "mail", { countText: texts[0] as Laya.GTextField });
            session.bindRedDot(badges[1] as unknown as Laya.Sprite, "mail", { countText: texts[1] as Laya.GTextField });
        }));
        const second = router.registerView(viewRoute("second"));
        const scene = router.createSceneUI(new TestView());
        const view = await scene.show(first, "first");
        const events = store as unknown as FakeWidget;
        expect(view.value).toBe("4");
        expect(events.listenerCount("mail")).toBe(3);
        store.set("mail", 5); store.set("mail", 6);
        expect(timer.pending).toBe(3);
        await scene.show(second, "second");
        expect(events.listenerCount("mail")).toBe(0);
        expect(timer.pending).toBe(0);
        store.set("mail", 8); timer.flush();
        expect(view.value).toBe("4");
        scene.close(second.id);
        expect(view.value).toBe("8");
        expect(texts.map(text => text.text)).toEqual(["8", "8"]);
        expect(events.listenerCount("mail")).toBe(3);
        expect(render).toHaveBeenCalledTimes(2);
        detachFirst(); detachFirst();
        store.set("mail", 0); timer.flush();
        expect(texts.map(text => text.text)).toEqual(["8", ""]);
        expect(events.listenerCount("mail")).toBe(2);
        store.set("mail", 1);
        scene.close(first.id);
        expect(timer.pending).toBe(0);
        expect(events.listenerCount("mail")).toBe(0);
        router.dispose();
    });

    it("keeps each scene mask immediately below its own top modal and removes it after the last close", async () => {
        const { router } = createRouter();
        const lowerRoute = router.registerView(popupRoute("lower"));
        const upperRoute = router.registerView(popupRoute("upper"));
        const left = router.createSceneUI(new TestView());
        const right = router.createSceneUI(new TestView());
        const lower = await left.show(lowerRoute, "lower");
        const upper = await left.show(upperRoute, "upper");
        const other = await right.show(lowerRoute, "other");
        expect(left.modalLayer).not.toBe(right.modalLayer);
        expect(left.modalLayer).not.toBe(groot.modalLayer);
        expect(left.root.getChildIndex(left.modalLayer!)).toBe(left.root.getChildIndex(upper) - 1);
        left.modalLayer!.event("click", { stopPropagation: vi.fn() });
        expect(upper.destroyed).toBe(true);
        expect(other.destroyed).toBe(false);
        expect(left.root.getChildIndex(left.modalLayer!)).toBe(left.root.getChildIndex(lower) - 1);
        left.modalLayer!.event("click", { stopPropagation: vi.fn() });
        expect(lower.destroyed).toBe(true);
        expect(left.modalLayer!.parent).toBeUndefined();
        expect(right.modalLayer!.parent).toBe(right.root);
        router.dispose();
    });

    it("keeps bindings paused when another view is shown under an inactive scene root", async () => {
        const store = new RedDotStore();
        store.set("mail", 1);
        const { router } = createRouter(store);
        const render = vi.fn();
        const page = router.registerView(viewRoute("root-paused", (view, _args, session) => {
            session.bindData(store, "mail", () => { render(); view.value = String(store.get("mail")); });
        }));
        const hud = router.registerView(configured(viewRoute("hud-paused"), { layer: UILayer.HUD }));
        const scene = router.createSceneUI(new TestView());
        const view = await scene.show(page, "page");
        const events = store as unknown as FakeWidget;
        scene.root.active = false;
        expect(events.listenerCount("mail")).toBe(0);
        await scene.show(hud, "hud");
        expect(events.listenerCount("mail")).toBe(0);
        store.set("mail", 2); timer.flush();
        expect(view.value).toBe("1");
        expect(render).toHaveBeenCalledOnce();
        scene.root.active = true;
        expect(events.listenerCount("mail")).toBe(1);
        expect(view.value).toBe("2");
        expect(render).toHaveBeenCalledTimes(2);
        router.dispose();
    });

    it("notifies onClosed once per displayed presentation across hide, reopen and native destroy", async () => {
        const { router } = createRouter();
        const closed = vi.fn();
        const route = router.registerView(configured({ ...viewRoute("page"), onClosed: closed }, { retention: "hide" }));
        const scene = router.createSceneUI(new TestView());
        const first = await scene.show(route, "first");
        scene.close(route.id); scene.close(route.id);
        expect(closed).not.toHaveBeenCalled();
        await Promise.resolve();
        expect(closed.mock.calls.map(call => call[1])).toEqual(["first"]);
        expect(await scene.show(route, "second")).toBe(first);
        first.destroy(); first.destroy();
        await Promise.resolve();
        expect(closed.mock.calls.map(call => call[1])).toEqual(["first", "second"]);
        flushComponentDestruction();
        scene.close(route.id);
        await Promise.resolve();
        expect(closed).toHaveBeenCalledTimes(2);
        router.dispose();
    });

    it("rejects late children and commits before a paused parent's deferred component destruction runs", async () => {
        const { router } = createRouter();
        let session!: UIViewSession;
        const parent = router.registerView(viewRoute("parent", (_view, _args, current) => { session = current; }));
        const covering = router.registerView(viewRoute("covering"));
        const child = router.registerView(popupRoute("child"));
        const scene = router.createSceneUI(new TestView());
        const view = await scene.show(parent, "parent");
        const top = await scene.show(covering, "covering");
        expect(view.active).toBe(false);
        const delayed = deferred<FakePrefab>();
        load.mockReturnValueOnce(delayed.promise);
        const loading = session.show(child, "late");
        const cancelled = expect(loading).rejects.toThrow("cancelled");
        view.destroy();
        expect(pendingComponentDestruction.length).toBeGreaterThan(0);
        expect(session.token.isCurrent()).toBe(false);
        expect(session.token.commit(() => { view.value = "bad"; })).toBe(false);
        await expect(session.show(child, "after-destroy")).rejects.toThrow("cancelled");
        const prefab = new FakePrefab(() => new TestView());
        delayed.resolve(prefab);
        await cancelled;
        await scene.waitForPendingLoads();
        expect(prefab.create).not.toHaveBeenCalled();
        expect(top.destroyed).toBe(false);
        expect(flushComponentDestruction()).toEqual([]);
        expect(scene.snapshot().views.map(item => item.routeId)).toEqual([covering.id]);
        router.dispose();
    });

    it("closes every matching instance even when one presentation cleanup fails", async () => {
        const { router } = createRouter();
        const route = router.registerView(configured(viewRoute("multiple", (_view, args, session) => {
            if (args === "bad") session.lifetime.defer(() => { throw new Error("cleanup failed"); });
        }), { multiplicity: "multiple" }));
        const scene = router.createSceneUI(new TestView());
        const bad = await scene.show(route, "bad");
        const good = await scene.show(route, "good");
        expect(() => scene.close(route.id)).toThrow();
        expect(bad.destroyed).toBe(true);
        expect(good.destroyed).toBe(true);
        expect(scene.root.numChildren).toBe(0);
        expect(scene.snapshot().views).toEqual([expect.objectContaining({ view: bad, cleanupFailed: true })]);
        expect(() => router.dispose()).toThrow();
    });

    it("retries a native destruction failure on a repeated close without retaining a successful retry", async () => {
        class RetryView extends TestView {
            attempts = 0;
            override destroy(): void {
                if (++this.attempts === 1) throw new Error("native destruction failed");
                super.destroy();
            }
        }
        const { router } = createRouter();
        const route = router.registerView(viewRoute("retry"));
        load.mockResolvedValueOnce(new FakePrefab(() => new RetryView()));
        const scene = router.createSceneUI(new TestView());
        const view = await scene.show(route, "retry");
        expect(() => scene.close(route.id)).toThrow();
        expect(view.destroyed).toBe(false);
        expect(scene.snapshot().views[0].cleanupFailed).toBe(true);
        expect(() => scene.close(route.id)).not.toThrow();
        expect(view.destroyed).toBe(true);
        expect(scene.snapshot().views).toHaveLength(0);
        router.dispose();
    });

    it("finishes native owner destruction even when its early component hook encounters a cleanup error", async () => {
        const { router } = createRouter();
        const route = router.registerView(viewRoute("bad-native", (_view, _args, session) => {
            session.lifetime.defer(() => { throw new Error("cleanup failed"); });
        }));
        const scene = router.createSceneUI(new TestView());
        const view = await scene.show(route, "bad-native");
        const authoredChild = new TestView();
        view.addChild(authoredChild);
        const logging = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            expect(() => view.destroy()).not.toThrow();
            expect(view.destroyed).toBe(true);
            expect(view.parent).toBeUndefined();
            expect(authoredChild.destroyed).toBe(true);
            expect(scene.snapshot().views[0].cleanupFailed).toBe(true);
            expect(() => router.dispose()).toThrow();
        } finally { logging.mockRestore(); }
    });

    it("restores the lower page and removes the mask after a modal page closes with a cleanup error", async () => {
        const { router } = createRouter();
        const lowerRoute = router.registerView(viewRoute("lower-page"));
        const upperRoute = router.registerView(configured(viewRoute("bad-modal-page", (_view, _args, session) => {
            session.lifetime.defer(() => { throw new Error("cleanup failed"); });
        }), { modal: true }));
        const scene = router.createSceneUI(new TestView());
        const lower = await scene.show(lowerRoute, "lower");
        const upper = await scene.show(upperRoute, "upper");
        expect(lower.active).toBe(false);
        expect(scene.modalLayer!.parent).toBe(scene.root);
        expect(() => scene.close(upperRoute.id)).toThrow();
        expect(upper.destroyed).toBe(true);
        expect(lower.active).toBe(true);
        expect(scene.modalLayer!.parent).toBeUndefined();
        expect(scene.snapshot().views.find(item => item.view === upper)?.cleanupFailed).toBe(true);
        expect(() => router.dispose()).toThrow();
    });

    it("retains diagnostics when native destroy returns without destroying, then permits a real retry", async () => {
        class NoopView extends TestView {
            block = true;
            override destroy(): void { if (!this.block) super.destroy(); }
        }
        const { router } = createRouter();
        const route = router.registerView<string, NoopView>(viewRoute("noop"));
        load.mockResolvedValueOnce(new FakePrefab(() => new NoopView()));
        const scene = router.createSceneUI(new TestView());
        const view = await scene.show(route, "noop");
        try {
            expect(() => scene.close(route.id)).toThrow();
            expect(view.destroyed).toBe(false);
            expect(view.parent).toBe(scene.root);
            expect(scene.snapshot().views[0].cleanupFailed).toBe(true);
            view.block = false;
            expect(() => scene.close(route.id)).not.toThrow();
            expect(view.destroyed).toBe(true);
            expect(scene.snapshot().views).toHaveLength(0);
        } finally {
            view.block = false;
            view.destroy();
            router.dispose();
        }
    });
});

function createRouter(redDots?: InstanceType<typeof RedDotStore>) {
    const layout = new FakeLayout();
    return { router: new UIRouter(undefined, layout as unknown as UILayoutService, { redDots }), layout };
}

function viewRoute(id: string, bind: (view: TestView, args: string, session: UIViewSession) => void | Promise<void>
    = (view, args) => { view.value = args; }): UIViewRoute<string, TestView> {
    return { id, url: `ui/${id}.lh`, bind };
}

function popupRoute(id: string): UIViewRoute<string, TestView> {
    return configured(viewRoute(id), { layer: UILayer.Popup, modal: true, navigation: "overlay" });
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(resolvePromise => { resolve = resolvePromise; });
    return { promise, resolve };
}

function configured<TArgs, TView extends Laya.GWidget>(route: UIViewRoute<TArgs, TView>, settings: Partial<UIViewSettings>): UIViewRoute<TArgs, TView> {
    prefabSettings.set(route.url, { ...prefabSettings.get(route.url), ...settings,
        ...(settings.layer !== undefined && settings.navigation === undefined ? { navigation: settings.layer === UILayer.Screen ? "page" : "overlay" } : {}) });
    return route;
}
