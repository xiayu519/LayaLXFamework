import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { HttpTransport } from "../../../src/framework/infrastructure/network/HttpTransport";
import type { PlatformService } from "../../../src/framework/platform/PlatformService";
import type { PurchasePlatform } from "../../../src/framework/platform/purchase/PurchasePlatform";

class FakeEventDispatcher {
    private readonly listeners = new Map<string, Map<unknown, (...args: unknown[]) => void>>();
    on(event: string, caller: unknown, listener: (...args: unknown[]) => void): void {
        if (!this.listeners.has(event)) this.listeners.set(event, new Map());
        this.listeners.get(event)!.set(caller, listener);
    }
    off(event: string, caller: unknown): void { this.listeners.get(event)?.delete(caller); }
    event(event: string, value: unknown): void {
        for (const [caller, listener] of this.listeners.get(event) ?? []) listener.call(caller, value);
    }
    offAll(): void { this.listeners.clear(); }
}

class FakeGWidget extends FakeEventDispatcher {
    readonly components: { onDestroy?(): void }[] = [];
    addComponent<T extends { onDestroy?(): void }>(type: new () => T): T { const instance = new type(); this.components.push(instance); return instance; }
    getComponent<T extends { onDestroy?(): void }>(type: new () => T): T | null {
        return this.components.find(component => component instanceof type) as T ?? null;
    }
    destroyed = false;
    active = true;
    get activeInHierarchy(): boolean { return this.active && (!this.parent || this.parent.activeInHierarchy); }
    visible = true;
    zOrder = 0;
    name = "";
    width = 720;
    height = 1280;
    x = 0;
    y = 0;
    parent: FakeGWidget | null = null;
    readonly children: FakeGWidget[] = [];
    contains(node: FakeGWidget): boolean { return this.children.includes(node) || this.children.some(child => child.contains(node)); }
    get numChildren(): number { return this.children.length; }
    pos(x: number, y: number): this { this.x = x; this.y = y; return this; }
    size(width: number, height: number): this { this.width = width; this.height = height; return this; }
    addChild(child: FakeGWidget): FakeGWidget { return this.addChildAt(child, this.children.length); }
    addChildAt(child: FakeGWidget, index: number): FakeGWidget {
        child.removeSelf();
        this.children.splice(index, 0, child);
        child.parent = this;
        return child;
    }
    removeSelf(): this {
        if (this.parent) this.parent.children.splice(this.parent.getChildIndex(this), 1);
        this.parent = null;
        return this;
    }
    getChildByName(name: string): FakeGWidget | undefined { return this.children.find(child => child.name === name); }
    getChildIndex(child: FakeGWidget): number { return this.children.indexOf(child); }
    setChildIndex(child: FakeGWidget, index: number): void {
        this.children.splice(this.getChildIndex(child), 1);
        this.children.splice(index, 0, child);
    }
    setChildIndexBefore(child: FakeGWidget, index: number): void {
        this.setChildIndex(child, this.getChildIndex(child) < index ? index - 1 : index);
    }
    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        for (const component of this.components) component.onDestroy?.();
        this.removeSelf();
        for (const child of [...this.children]) child.destroy();
    }
    findChild(): FakeTextField { return new FakeTextField(); }
}

class FakeTextField extends FakeGWidget {
    text = "";
}

class FakeGWindow extends FakeGWidget {
    contentPane!: FakeGWidget;
    modal = false;
    isShowing = false;
    show(): void { this.isShowing = true; root.addChild(this); root.adjustModalLayer(); }
    hide(): void {
        if (!this.isShowing) return;
        this.isShowing = false;
        this.removeSelf();
        this.onHide();
        root.adjustModalLayer();
    }
    protected onHide(): void {}
    override destroy(): void { this.hide(); this.contentPane?.destroy(); super.destroy(); }
}

class FakeRoot extends FakeGWidget {
    readonly modalLayer = new FakeGWidget();
    adjustModalLayer(): void {
        const modal = [...this.children].reverse().find(child => child instanceof FakeGWindow && child.modal);
        if (!modal) { this.modalLayer.removeSelf(); return; }
        if (this.modalLayer.parent) this.setChildIndexBefore(this.modalLayer, this.getChildIndex(modal));
        else this.addChildAt(this.modalLayer, this.getChildIndex(modal));
    }
}

class FakePrefab {
    constructor(readonly create: () => unknown) {}
}

class FakeTextResource {
    constructor(readonly data: unknown) {}
}

const storage = new Map<string, string>();
const sceneGc = vi.fn();
class FakeScene extends FakeGWidget {
    static gc(): void { sceneGc(); }
    autoDestroyAtClosed = false;
    open(): void { this.parent = new FakeGWidget(); }
    close(): void { if (this.autoDestroyAtClosed) this.destroy(); }
}
const root = new FakeRoot();
const clearRes = vi.fn();
const tableBytes = readFileSync(resolve("assets/bootstrap/tables/tbtableappconfig.bin"));
const runtimeConfig = JSON.parse(readFileSync(resolve("assets/bootstrap/config/runtime.json"), "utf8"));
vi.stubGlobal("Laya", {
    regClass: () => () => {},
    property: () => () => {},
    Script: class { enabled = true; },
    Sprite: FakeGWidget,
    Node: FakeGWidget,
    Tween: { killAll: vi.fn() },
    EventDispatcher: FakeEventDispatcher,
    Event: { CLICK: "click" },
    GButton: FakeGWidget,
    GWidget: FakeGWidget, GLoader: FakeGWidget,
    GTextField: FakeTextField,
    GWindow: FakeGWindow,
    GRoot: { inst: root },
    Prefab: FakePrefab,
    TextResource: FakeTextResource,
    Loader: { HIERARCHY: "HIERARCHY", BUFFER: "arraybuffer", JSON: "json" },
    loader: {
        load: vi.fn(async (url: string) => {
            if (url === "bootstrap/tables/tbtableappconfig.bin") {
                return {
                    data: tableBytes.buffer.slice(tableBytes.byteOffset, tableBytes.byteOffset + tableBytes.byteLength),
                };
            }
            if (url === "bootstrap/config/runtime.json") {
                return new FakeTextResource(runtimeConfig);
            }
            if (url === "bootstrap/ui/examples/UILobby.lh") {
                const { UILobby } = await import("../../../src/game/logic/presentation/ui/examples/UILobby");
                const { UIViewLifecycle } = await import("../../../src/framework/presentation/ui/UIViewLifecycle");
                return new FakePrefab(() => {
                    const view = new UILobby();
                    view.addComponent(UIViewLifecycle); // Simulates the authored prefab component.
                    return Object.assign(view, {
                    statusText: new FakeTextField(), detailText: new FakeTextField(), examplesButton: new FakeGWidget(), battleButton: new FakeGWidget(),
                    inventoryText: new FakeTextField(), feedbackText: new FakeTextField(), rewardButton: new FakeGWidget(),
                    snapshotButton: new FakeGWidget(), replayButton: new FakeGWidget(), inventoryBadge: new FakeGWidget(), inventoryBadgeCount: new FakeTextField(),
                    });
                });
            }
            if (url === "bootstrap/scenes/Lobby.ls") {
                const { LobbyScene } = await import("../../../src/game/logic/presentation/scenes/LobbyScene");
                return new FakePrefab(() => {
                    const scene = new LobbyScene();
                    scene.uiRoot = scene.addChild(Object.assign(new FakeGWidget(), { name: "uiRoot" }) as unknown as Laya.GWidget);
                    return scene;
                });
            }
            if (url === "bootstrap/ui/UISceneLoading.lh") {
                const { UISceneLoading } = await import("../../../src/game/logic/presentation/ui/UISceneLoading");
                return new FakePrefab(() => Object.assign(new UISceneLoading(), {
                    phaseText: new FakeTextField(), sceneProgressText: new FakeTextField(),
                    resourceProgressText: new FakeTextField(), percentText: new FakeTextField(), progressFill: new FakeGWidget(),
                }));
            }
            throw new Error(`Unexpected test resource '${url}'.`);
        }),
        clearRes,
    },
    Pool: {
        getPoolBySign: vi.fn(() => []),
        getItem: vi.fn(() => null),
        recover: vi.fn(),
        clearBySign: vi.fn(),
    },
    Scene: FakeScene,
    timer: { clearAll: vi.fn(), clearCallLater: vi.fn(), callLater: (caller: unknown, method: () => void) => method.call(caller), frameOnce: (_delay: number, caller: unknown, method: () => void) => method.call(caller) },
    LocalStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
    },
    SoundManager: {
        muted: false,
        musicVolume: 1,
        soundVolume: 1,
    },
});

let { lx } = await import("../../../src/framework/lx");
let { createApplication } = await import("../../../src/game/bootstrap/createApplication");
let { createRuntime } = await import("../../../src/framework/bootstrap/createRuntime");
let { RedDotBinding } = await import("../../../src/framework/presentation/ui/RedDotBinding");

beforeEach(async () => {
    // Fault-injection cases deliberately quarantine broken runtimes; production has no reset bypass.
    vi.resetModules();
    ({ lx } = await import("../../../src/framework/lx"));
    ({ createApplication } = await import("../../../src/game/bootstrap/createApplication"));
    ({ createRuntime } = await import("../../../src/framework/bootstrap/createRuntime"));
    ({ RedDotBinding } = await import("../../../src/framework/presentation/ui/RedDotBinding"));
    for (const child of [...root.children]) child.destroy();
    sceneGc.mockReset();
    clearRes.mockReset();
});

afterAll(() => vi.unstubAllGlobals());

describe("createApplication", () => {
    it("prepares common routes without loading and keeps account updates alive without any World", async () => {
        const { EXAMPLE_INVENTORY_DATA } = await import("../../../src/game/logic/application/ExampleDataKeys");
        const { ExampleInventoryData } = await import("../../../src/game/logic/infrastructure/examples/ExampleInventoryData");
        const loadsBefore = vi.mocked(Laya.loader.load).mock.calls.length;
        const application = createApplication();
        const account = application.data.get(EXAMPLE_INVENTORY_DATA);
        if (!(account instanceof ExampleInventoryData)) throw new Error("Account data composition changed.");
        expect(application.scenes.snapshot().registeredRoutes).toEqual([]);
        expect(application.worlds.snapshot().worlds).toEqual([]);
        expect(() => application.ui.registerView({ id: "lx.examples.confirm", url: "unused.lh" })).toThrow("Duplicate UI route");
        expect(vi.mocked(Laya.loader.load).mock.calls).toHaveLength(loadsBefore);
        await application.start();
        try {
            const previous = application.scenes.get("examples.lobby")!;
            await application.worlds.exit("examples.lobby");
            expect(previous.destroyed).toBe(true);
            expect(application.scenes.snapshot().registeredRoutes).toEqual([]);
            expect(application.worlds.snapshot().worlds).toEqual([]);
            expect(account.createReceiver().applySnapshot({ version: account.version + 1,
                items: [{ id: "supplies", name: "Supplies", quantity: 9 }] })).toBe("applied");
            expect(application.ui.redDots.get("examples/inventory")).toBe(9);
            expect(() => application.ui.registerView({ id: "lx.examples.confirm", url: "unused.lh" })).toThrow("Duplicate UI route");
            await application.worlds.enter("examples.lobby");
            expect(application.data.get(EXAMPLE_INVENTORY_DATA)).toBe(account);
            expect(account.totalQuantity).toBe(9);
            expect(application.ui.redDots.get("examples/inventory")).toBe(9);
        } finally { await application.stop(); }
        expect(() => application.ui.registerView({ id: "after-stop", url: "unused.lh" })).toThrow(/disposed/);
        expect(application.ui.redDots.disposed).toBe(true);
    });

    it("injects platform boundaries and leaves saved settings unchanged at shutdown", async () => {
        storage.clear();
        const platform: PlatformService = {
            name: "platform:test",
            kind: "native",
            viewport: { width: 750, height: 1334, safeArea: { x: 0, y: 0, width: 750, height: 1334 } },
            start: vi.fn(),
            stop: vi.fn(),
            nowMs: () => 0,
            openExternalUrl: vi.fn(),
        };
        const purchase: PurchasePlatform = {
            supported: true,
            purchase: vi.fn(),
            restore: vi.fn(),
        };
        const http = { request: vi.fn() } as unknown as HttpTransport;
        const application = createApplication({ platform, purchase, http });
        const { EXAMPLE_INVENTORY_DATA } = await import("../../../src/game/logic/application/ExampleDataKeys");
        const account = application.data.get(EXAMPLE_INVENTORY_DATA);
        expect(account.totalQuantity).toBe(0);
        expect(application.worlds.get("examples.lobby")).toBeUndefined();
        expect(application.scenes.snapshot().registeredRoutes).toEqual([]);

        expect(application.platform).toBe(platform);
        expect(application.purchase).toBe(purchase);
        expect(application.http).toBe(http);
        await application.start();
        expect(lx.ready).toBe(true);
        expect(account.totalQuantity).toBe(300);
        expect(lx.data.get(EXAMPLE_INVENTORY_DATA)).toBe(account);
        expect(lx.worlds.get("examples.lobby")?.id).toBe("examples.lobby");
        expect("ui" in lx.worlds.get("examples.lobby")!).toBe(false);
        expect(lx.tables.ready).toBe(true);
        expect(lx.config.ready).toBe(true);
        const scene = lx.scenes.get("examples.lobby")!;
        const status = scene.ui.snapshot().views.find(view => view.routeId === "lx.status")!;
        expect(status.view.parent).toBe(scene.getChildByName("uiRoot"));
        expect(root.children).not.toContain(status.view);
        expect(application.ui.snapshot().scenes).toHaveLength(1);
        expect(lx.ui.redDots.get("examples/inventory")).toBe(300);
        expect(RedDotBinding.defaultStore).toBe(lx.ui.redDots);
        expect(await lx.config.load<{ framework: string }>("lx.runtime-config")).toEqual(runtimeConfig);
        expect(lx.config.ready).toBe(true);
        application.settings.save({
            language: "en-US",
            muted: true,
            musicVolume: 0.25,
            soundVolume: 0.5,
        });

        await application.stop();
        expect(lx.ready).toBe(false);
        expect(application.tables.ready).toBe(false);
        expect(application.config.ready).toBe(false);
        expect(account.totalQuantity).toBe(0);
        expect(application.worlds.snapshot().worlds).toEqual([]);
        expect(application.scenes.snapshot().registeredRoutes).toEqual([]);
        expect(scene.destroyed).toBe(true);
        expect(status.view.destroyed).toBe(true);
        expect(application.ui.redDots.disposed).toBe(true);
        expect(RedDotBinding.defaultStore).toBeUndefined();
        expect(JSON.parse(storage.get("lx.client-settings") ?? "null").data).toEqual({
            language: "en-US",
            muted: true,
            musicVolume: 0.25,
            soundVolume: 0.5,
        });
        expect(sceneGc).toHaveBeenCalled();
        expect(clearRes).toHaveBeenCalledWith("bootstrap/tables/tbtableappconfig.bin");
        expect(clearRes).toHaveBeenCalledWith("bootstrap/config/runtime.json");
        expect(platform.stop).toHaveBeenCalledOnce();
    });

    it("rolls back application badge subscriptions when startup fails before entering a World", async () => {
        const { GameReadyService } = await import("../../../src/game/logic/bootstrap/GameReadyService");
        const { EXAMPLE_INVENTORY_DATA } = await import("../../../src/game/logic/application/ExampleDataKeys");
        const { ExampleInventoryData } = await import("../../../src/game/logic/infrastructure/examples/ExampleInventoryData");
        const application = createApplication();
        const account = application.data.get(EXAMPLE_INVENTORY_DATA);
        if (!(account instanceof ExampleInventoryData)) throw new Error("Account data composition changed.");
        const unsubscribe = vi.spyOn(account, "off");
        const start = vi.spyOn(GameReadyService.prototype, "start").mockRejectedValueOnce(new Error("login failed"));
        try {
            await expect(application.start()).rejects.toThrow("login failed");
            expect(unsubscribe).toHaveBeenCalledWith(ExampleInventoryData.CHANGED, expect.any(Object), expect.any(Function));
            expect(application.worlds.snapshot().worlds).toEqual([]);
            expect(application.ui.redDots.disposed).toBe(true);
            expect(account.totalQuantity).toBe(0);
        } finally { start.mockRestore(); unsubscribe.mockRestore(); }
    });

    it("removes the lx binding when runtime startup fails", async () => {
        const platform: PlatformService = {
            name: "platform:broken",
            kind: "native",
            viewport: { width: 750, height: 1334, safeArea: { x: 0, y: 0, width: 750, height: 1334 } },
            start: vi.fn(() => { throw new Error("platform unavailable"); }),
            stop: vi.fn(),
            nowMs: () => 0,
            openExternalUrl: vi.fn(),
        };
        const application = createApplication({ platform });

        await expect(application.start()).rejects.toThrow(
            "Service 'platform:broken' failed to start: platform unavailable",
        );
        expect(lx.ready).toBe(false);
        expect(() => lx.ui).toThrow("runtime is not attached");
        expect(RedDotBinding.defaultStore).toBeUndefined();
    });

    it("loads the application-selected Tip prefab without requiring the starter asset path", async () => {
        const runtime = createRuntime({ tipPrefabUrl: "bootstrap/ui/CustomTip.lh" });
        await runtime.start();
        try {
            const node = new FakeGWidget();
            vi.mocked(Laya.loader.load).mockResolvedValueOnce(new FakePrefab(() => node));
            const tip = await runtime.pool.acquire("lx.ui.tip");
            expect(tip).toBe(node);
            expect(vi.mocked(Laya.loader.load).mock.lastCall?.[0]).toBe("bootstrap/ui/CustomTip.lh");
            runtime.pool.release("lx.ui.tip", tip);
        } finally { await runtime.stop(); }
    });

    it("stops game services before the shared Laya resource collection boundary", async () => {
        const events: string[] = [];
        sceneGc.mockImplementationOnce(() => { events.push("gc"); });
        const runtime = createRuntime({ tipPrefabUrl: "test-tip.lh",
            createServices() {
                return [{
                    name: "game-owner",
                    start(): void {},
                    stop(): void { events.push("game"); },
                }];
            },
        });

        await runtime.start();
        await runtime.stop();
        expect(events).toEqual(["game", "gc"]);
    });

    it("waits for native component destruction before requesting GC", async () => {
        const runtime = createRuntime({ tipPrefabUrl: "test-tip.lh",});
        await runtime.start();
        let finishFrame: (() => void) | undefined;
        const timer = vi.spyOn(Laya.timer, "frameOnce").mockImplementation((_delay, caller, method) => {
            finishFrame = () => method.call(caller);
        });
        try {
            const stopping = runtime.stop();
            await vi.waitFor(() => expect(finishFrame).toBeDefined());
            expect(sceneGc).not.toHaveBeenCalled();
            finishFrame!(); await stopping;
            expect(sceneGc).toHaveBeenCalledOnce();
        } finally { timer.mockRestore(); }
    });

    it("skips GC and clears its pending frame if rendering remains suspended", async () => {
        const runtime = createRuntime({ tipPrefabUrl: "test-tip.lh", lifecycle: { pendingLoadTimeoutMs: 20, stopTimeoutMs: 100 } });
        await runtime.start();
        const timer = vi.spyOn(Laya.timer, "frameOnce").mockImplementation(() => {});
        try {
            await expect(runtime.stop()).rejects.toThrow("service(s) failed to stop");
            expect(sceneGc).not.toHaveBeenCalled();
            expect(runtime.snapshot()).toMatchObject({ pendingCleanup: [], gc: "skipped" });
        } finally { timer.mockRestore(); }
    });

    it("continues every runtime cleanup step after an earlier failure", async () => {
        const runtime = createRuntime({ tipPrefabUrl: "test-tip.lh",});
        const events: string[] = [];
        vi.spyOn(runtime.ui, "dispose")
            .mockImplementationOnce(() => { events.push("ui"); throw new Error("ui cleanup failed"); })
            .mockImplementation(() => { events.push("ui-retry"); });
        vi.spyOn(runtime.ui, "waitForPendingLoads").mockImplementation(async () => { events.push("pending-ui"); });
        vi.spyOn(runtime.pool, "dispose")
            .mockImplementationOnce(() => { events.push("pool"); })
            .mockImplementation(() => { events.push("pool-retry"); });
        vi.spyOn(runtime.pool, "waitForPendingLoads").mockImplementation(async () => { events.push("pending-pool"); });
        vi.spyOn(runtime.audio, "dispose").mockImplementation(() => { events.push("audio"); });
        vi.spyOn(runtime.config, "dispose").mockImplementation(() => { events.push("config"); });
        vi.spyOn(runtime.config, "waitForPendingLoads").mockImplementation(async () => { events.push("pending-config"); });
        sceneGc.mockImplementationOnce(() => { events.push("gc"); });

        await runtime.start();
        await expect(runtime.stop()).rejects.toThrow("service(s) failed to stop");

        expect(events).toEqual([
            "ui", "pool", "audio", "config",
            "pending-ui", "pending-pool", "pending-config", "ui-retry", "pool-retry", "gc",
        ]);
        expect(lx.ready).toBe(false);
    });

    it("stops owners before bounded waiting and skips GC while a load is unresolved", async () => {
        const runtime = createRuntime({ tipPrefabUrl: "test-tip.lh", lifecycle: { pendingLoadTimeoutMs: 20, stopTimeoutMs: 100 } });
        const audioStop = vi.spyOn(runtime.audio, "dispose");
        vi.spyOn(runtime.ui, "waitForPendingLoads").mockReturnValue(new Promise<void>(() => {}));
        await runtime.start();
        await expect(runtime.stop()).rejects.toThrow("service(s) failed to stop");
        expect(audioStop).toHaveBeenCalledOnce();
        expect(sceneGc).not.toHaveBeenCalled();
        expect(runtime.snapshot()).toMatchObject({ pendingCleanup: ["ui"], gc: "skipped" });
    });

    it("skips runtime GC when an already-releasing scene reports cleanup failure after stop begins", async () => {
        const { BaseGameScene } = await import("../../../src/framework/presentation/scene/BaseGameScene");
        let release!: () => void;
        let notifyLeaving!: () => void;
        const leaving = new Promise<void>(resolve => { notifyLeaving = resolve; });
        const releaseGate = new Promise<void>(resolve => { release = resolve; });
        class BrokenScene extends BaseGameScene {
            constructor() {
                super();
                this.own(() => { throw new Error("late scene cleanup failed"); });
            }
            protected override async onTransitionLeaving(): Promise<void> {
                notifyLeaving();
                await releaseGate;
            }
        }
        const runtime = createRuntime({ tipPrefabUrl: "test-tip.lh", configureScenes(flow) {
            flow.register({ id: "source", url: "source.ls" });
        } });
        await runtime.start();
        vi.mocked(Laya.loader.load).mockResolvedValueOnce(new FakePrefab(() => new BrokenScene()));
        await runtime.scenes.open("source", undefined, { showLoading: false });
        const switching = runtime.scenes.open("source", undefined, { showLoading: false }).catch(error => error);
        await leaving;
        const stopping = runtime.stop().then(() => undefined, error => error);
        await vi.waitFor(() => expect(runtime.scenes.snapshot().disposed).toBe(true));
        release();
        await switching;
        expect(await stopping).toBeInstanceOf(Error);
        expect(sceneGc).not.toHaveBeenCalled();
        expect(runtime.snapshot().gc).toBe("skipped");
    });
});
