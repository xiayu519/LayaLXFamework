import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { HttpTransport } from "../../../src/framework/infrastructure/network/HttpTransport";
import type { PlatformService } from "../../../src/framework/platform/PlatformService";
import type { PurchasePlatform } from "../../../src/framework/platform/purchase/PurchasePlatform";
import { FrameworkEvent } from "../../../src/framework/bootstrap/FrameworkEvent";

class FakeEventDispatcher {
    private readonly listeners = new Map<string, Map<unknown, (...args: unknown[]) => void>>();
    on(event: string, caller: unknown, listener: (...args: unknown[]) => void): void {
        if (!this.listeners.has(event)) this.listeners.set(event, new Map());
        this.listeners.get(event)!.set(caller, listener);
    }
    off(event: string, caller: unknown): void { this.listeners.get(event)?.delete(caller); }
    offAllCaller(caller: unknown): void { for (const listeners of this.listeners.values()) listeners.delete(caller); }
    event(event: string, value: unknown): void {
        for (const [caller, listener] of this.listeners.get(event) ?? []) listener.call(caller, value);
    }
    offAll(): void { this.listeners.clear(); }
}

class FakeSocket extends FakeEventDispatcher {
    public readonly input = { clear: vi.fn() };
    public readonly output = { clear: vi.fn() };
    public connected = false;

    public once(event: string, caller: unknown, listener: (...args: unknown[]) => void): void {
        this.on(event, caller, (...args) => {
            this.off(event, caller);
            listener.apply(caller, args);
        });
    }

    public close(): void {
        this.connected = false;
        this.event("close", undefined);
    }
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
    Socket: FakeSocket,
    Event: { CLICK: "click", OPEN: "open", CLOSE: "close", MESSAGE: "message", ERROR: "error" },
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
                    view.addComponent(UIViewLifecycle); // 模拟预制体中配置的组件。
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
let { GameApplication } = await import("../../../src/game/logic/bootstrap/GameApplication");
let { RedDotBinding } = await import("../../../src/framework/presentation/ui/RedDotBinding");

beforeEach(async () => {
    vi.resetModules();
    ({ lx } = await import("../../../src/framework/lx"));
    ({ GameApplication } = await import("../../../src/game/logic/bootstrap/GameApplication"));
    ({ RedDotBinding } = await import("../../../src/framework/presentation/ui/RedDotBinding"));
    for (const child of [...root.children]) child.destroy();
    storage.clear();
    sceneGc.mockReset();
    clearRes.mockReset();
});

afterEach(async () => {
    await lx.stop().catch(() => {});
    vi.restoreAllMocks();
});
afterAll(() => vi.unstubAllGlobals());

const baseConfig = { tipPrefabUrl: "test-tip.lh" };

describe("single lx root", () => {
    it("exists before initialization without allocating native modules", async () => {
        const { logger } = await import("../../../src/framework/application/diagnostics/Logger");
        expect(lx.logger).toBe(logger);
        expect(globalThis.lx).toBe(lx);
        expect(lx.ready).toBe(false);
        expect(() => lx.net).toThrow("not initialized");
        expect(lx.ui).toBeUndefined();
    });

    it("shares concurrent/reentrant initialization and waits for data before creating the initial World", async () => {
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const order: string[] = [];
        let nested: Promise<void> | undefined;
        const config = { ...baseConfig, initialWorld: "lobby",
            register() {
                order.push("register");
                lx.worlds.register({ id: "lobby", initialize(world) {
                    expect(lx.ready).toBe(true);
                    order.push("lobby");
                    world.own(() => { order.push("child-stop"); });
                } });
            },
            initialize() { order.push("initialize"); nested = lx.init(config); },
            synchronization: { source: "test-server", async synchronize() {
                order.push("sync"); await gate;
                lx.redDots.set("mail", 1);
            } },
            dispose() { order.push("game-stop"); },
        };
        const first = lx.init(config);
        expect(lx.init(config)).toBe(first);
        await vi.waitFor(() => expect(order).toEqual(["register", "initialize", "sync"]));
        expect(nested).toBe(first);
        expect(lx.ready).toBe(false);
        await expect(lx.worlds.enter("lobby")).rejects.toThrow("not ready");
        release();
        await first;
        expect(order).toEqual(["register", "initialize", "sync", "lobby"]);
        expect(lx.snapshot().synchronization).toEqual({ source: "test-server", state: "ready" });
        await lx.stop();
        expect(order.slice(-2)).toEqual(["child-stop", "game-stop"]);
        expect(RedDotBinding.defaultStore).toBeUndefined();
    });

    it("does not start another generation while an immediate stop is pending", async () => {
        const register = vi.fn();
        const first = lx.init({ ...baseConfig, register }).catch(error => error);
        const stopping = lx.stop();
        await expect(lx.init(baseConfig)).rejects.toThrow("cleanup remains incomplete");
        await stopping;
        expect(await first).toBeInstanceOf(Error);
        expect(register).not.toHaveBeenCalled();
        await lx.init(baseConfig);
        expect(lx.ready).toBe(true);
    });

    it("initializes an idle native WebSocket independently of HTTP and retires it on stop", async () => {
        await lx.init(baseConfig);
        const socket = lx.net;
        expect(socket).toBeInstanceOf(Laya.Socket);
        expect(socket.connected).toBe(false);
        expect(lx.http.request).toBeTypeOf("function");
        expect(lx.net).toBe(socket);
        await lx.stop();
        expect(() => lx.net).toThrow("stopped");
        expect(socket.connected).toBe(false);
        expect(lx.ready).toBe(false);
    });

    it("reinitializes the same lx object with fresh modules after a clean stop", async () => {
        const rootIdentity = lx;
        await lx.init(baseConfig);
        const socket = lx.net, events = lx.events, worlds = lx.worlds;
        await lx.stop();
        await lx.init(baseConfig);
        expect(lx).toBe(rootIdentity);
        expect(globalThis.lx).toBe(rootIdentity);
        expect(lx.net).not.toBe(socket);
        expect(lx.events).not.toBe(events);
        expect(lx.worlds).not.toBe(worlds);
    });

    it("rolls back a failed full synchronization without creating the Lobby", async () => {
        const entered = vi.fn(), dispose = vi.fn();
        await expect(lx.init({ ...baseConfig, initialWorld: "lobby",
            register() { lx.worlds.register({ id: "lobby", initialize: entered }); },
            synchronization: { source: "server", async synchronize() { throw new Error("first snapshot failed"); } },
            dispose,
        })).rejects.toThrow("first snapshot failed");
        expect(entered).not.toHaveBeenCalled();
        expect(dispose).toHaveBeenCalledOnce();
        expect(lx.ready).toBe(false);
        expect(lx.redDots.disposed).toBe(true);
        expect(lx.snapshot().synchronization.state).toBe("failed");
        await lx.init(baseConfig);
        expect(lx.ready).toBe(true);
    });

    it("cleans partially registered game owners after register throws", async () => {
        const cleanup = vi.fn();
        await expect(lx.init({ ...baseConfig,
            register() { throw new Error("registration failed"); }, dispose: cleanup,
        })).rejects.toThrow("registration failed");
        expect(cleanup).toHaveBeenCalledOnce();
        expect(lx.redDots.disposed).toBe(true);
        expect(lx.scenes.snapshot().disposed).toBe(true);
    });

    it("cleans modules when application presenter construction throws", async () => {
        const close = vi.spyOn(FakeSocket.prototype, "close");
        await expect(lx.init({ ...baseConfig,
            createSceneLoadingPresenter() { throw new Error("presenter failed"); },
        })).rejects.toThrow("presenter failed");
        expect(close).toHaveBeenCalledOnce();
        expect(() => lx.net).toThrow("stopped");
        expect(lx.redDots.disposed).toBe(true);
        await lx.init(baseConfig);
        expect(lx.ready).toBe(true);
    });

    it("closes the root when initial World entry fails", async () => {
        const cleanup = vi.fn();
        await expect(lx.init({ ...baseConfig, initialWorld: "lobby",
            register() { lx.worlds.register({ id: "lobby", initialize(world) {
                world.own(cleanup); throw new Error("lobby failed");
            } }); },
        })).rejects.toThrow("lobby failed");
        expect(cleanup).toHaveBeenCalledOnce();
        expect(lx.ready).toBe(false);
        expect(lx.snapshot().worlds.worlds).toEqual([]);
        await lx.init(baseConfig);
    });

    it("keeps global and sibling subscriptions when a World exits", async () => {
        await lx.init(baseConfig);
        const global = vi.fn(), first = vi.fn(), second = vi.fn();
        lx.events.on("change", global, global);
        lx.worlds.register({ id: "a", initialize(world) { world.listen(lx.events, "change", first, first); } });
        lx.worlds.register({ id: "b", initialize(world) { world.listen(lx.events, "change", second, second); } });
        const a = await lx.worlds.enter("a"), b = await lx.worlds.enter("b");
        expect(a.events).not.toBe(b.events);
        expect(a.events).not.toBe(lx.events);
        await lx.worlds.exit("a");
        lx.events.event("change");
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledOnce();
        expect(global).toHaveBeenCalledOnce();
        expect(lx.worlds.get("b")).toBe(b);
    });

    it("框架事件只报告根生命周期，子 World 单独退出不会关闭根", async () => {
        let releaseSync!: () => void, releaseCleanup!: () => void;
        const sync = new Promise<void>(resolve => { releaseSync = resolve; });
        const cleanup = new Promise<void>(resolve => { releaseCleanup = resolve; });
        const order: string[] = [];
        const childListener = vi.fn();
        const caller = {};
        let nestedStop: Promise<void> | undefined;
        const starting = lx.init({ ...baseConfig, initialWorld: "lobby", register() {
            lx.events.on(FrameworkEvent.READY, caller, () => {
                expect(lx.ready).toBe(true);
                expect(lx.redDots.get("mail")).toBe(2);
                expect(lx.worlds.get("lobby")).toBeUndefined();
                order.push("ready");
            });
            lx.events.on(FrameworkEvent.STOPPING, caller, () => {
                expect(lx.ready).toBe(false);
                order.push("stopping");
                nestedStop = lx.stop();
            });
            lx.worlds.register({ id: "lobby", initialize(world) {
                world.listen(lx.events, FrameworkEvent.STOPPING, childListener, childListener);
                world.own(async () => { await cleanup; order.push("cleaned"); });
            } });
        }, synchronization: { source: "test", async synchronize() {
            await sync;
            lx.redDots.set("mail", 2);
        } } });
        await vi.waitFor(() => expect(lx.snapshot().synchronization.state).toBe("pending"));
        expect(order).toEqual([]);
        releaseSync();
        await starting;
        await lx.init(baseConfig);
        await lx.worlds.enter("lobby");
        expect(order).toEqual(["ready"]);
        const exiting = lx.worlds.exit("lobby");
        expect(lx.worlds.exit("lobby")).toBe(exiting);
        await Promise.resolve();
        expect(order).toEqual(["ready"]);
        releaseCleanup();
        await exiting;
        expect(order).toEqual(["ready", "cleaned"]);
        expect(lx.ready).toBe(true);
        const liveChild = vi.fn();
        lx.worlds.register({ id: "battle", initialize(world) {
            world.listen(lx.events, FrameworkEvent.STOPPING, liveChild, liveChild);
            world.own(() => { order.push("battle-cleaned"); });
        } });
        await lx.worlds.enter("battle");
        const dispatcher = lx.events;
        const stopping = lx.stop();
        expect(nestedStop).toBe(stopping);
        expect(lx.stop()).toBe(stopping);
        expect(order).toEqual(["ready", "cleaned", "stopping"]);
        expect(childListener).not.toHaveBeenCalled();
        expect(liveChild).toHaveBeenCalledOnce();
        await stopping;
        expect(order).toEqual(["ready", "cleaned", "stopping", "battle-cleaned"]);
        dispatcher.event(FrameworkEvent.READY);
        dispatcher.event(FrameworkEvent.STOPPING);
        expect(liveChild).toHaveBeenCalledOnce();
        expect(order).toHaveLength(4);
    });

    it("关闭通知抛错仍立即失效子 World，清理结束后通过共享任务报告错误", async () => {
        await lx.init(baseConfig);
        const cleaned = vi.fn(), listener = vi.fn();
        const failure = new Error("stop observer failed");
        let nested: Promise<void> | undefined;
        lx.events.on(FrameworkEvent.STOPPING, {}, () => {
            nested = lx.stop();
            throw failure;
        });
        lx.worlds.register({ id: "child", initialize(world) {
            world.listen(world.events, "local", listener, listener);
            world.own(cleaned);
        } });
        const world = await lx.worlds.enter("child");
        const stopping = lx.stop();
        expect(nested).toBe(stopping);
        expect(lx.stop()).toBe(stopping);
        expect(world.signal.aborted).toBe(true);
        world.events.event("local");
        expect(listener).not.toHaveBeenCalled();
        await expect(stopping).rejects.toBe(failure);
        expect(cleaned).toHaveBeenCalledOnce();
        expect(lx.snapshot().worlds.worlds).toEqual([]);
        expect(lx.snapshot().bootstrap.state).toBe("stopped");
        expect(() => lx.net).toThrow("stopped");
        await lx.init(baseConfig);
        expect(lx.ready).toBe(true);
    });

    it("取消进入立即卸载局部事件，并等待晚到清理；清理失败保留诊断", async () => {
        await lx.init(baseConfig);
        let release!: () => void;
        const pending = new Promise<void>(resolve => { release = resolve; });
        const cleaned = vi.fn(), listener = vi.fn();
        let localEvents!: Laya.EventDispatcher;
        lx.worlds.register({ id: "loading", async initialize(world) {
            localEvents = world.events;
            world.listen(localEvents, "local:request", listener, listener);
            await pending;
            world.own(cleaned);
        } });
        const entering = lx.worlds.enter("loading");
        await Promise.resolve();
        localEvents.event("local:request");
        expect(listener).toHaveBeenCalledOnce();
        const leaving = lx.worlds.exit("loading");
        await expect(entering).rejects.toThrow("cancelled");
        localEvents.event("local:request");
        expect(listener).toHaveBeenCalledOnce();
        expect(cleaned).not.toHaveBeenCalled();
        release();
        await leaving;
        expect(cleaned).toHaveBeenCalledOnce();
        expect(lx.worlds.get("loading")).toBeUndefined();
        lx.worlds.register({ id: "broken", initialize(world) {
            world.own(() => { throw new Error("cleanup failed"); });
        } });
        await lx.worlds.enter("broken");
        await expect(lx.worlds.exit("broken")).rejects.toThrow("cleanup failed");
        expect(lx.worlds.snapshot().cleanupFailures).toBe(1);
    });

    it("就绪监听器同步停止框架时不再进入初始 World", async () => {
        const create = vi.fn(() => ({ id: "lobby", initialize() {} }));
        await expect(lx.init({ ...baseConfig, initialWorld: "lobby", register() {
            const caller = {};
            lx.events.on(FrameworkEvent.READY, caller, () => { void lx.stop(); });
            lx.worlds.register({ id: "lobby", create });
        } })).rejects.toThrow("stopped");
        expect(create).not.toHaveBeenCalled();
        expect(lx.snapshot().bootstrap.state).toBe("stopped");
    });

    it("compensates a late game initialization before allowing another initialization", async () => {
        let finish!: () => void;
        const gate = new Promise<void>(resolve => { finish = resolve; });
        let sideEffect = false;
        const dispose = vi.fn(() => { sideEffect = false; });
        const starting = lx.init({ ...baseConfig,
            lifecycle: { startTimeoutMs: 20, stopTimeoutMs: 100, pendingLoadTimeoutMs: 10 },
            async initialize() { await gate; sideEffect = true; },
            dispose,
        }).catch(error => error);
        expect(await starting).toBeInstanceOf(Error);
        await expect(lx.init(baseConfig)).rejects.toThrow("cleanup remains incomplete");
        finish();
        await vi.waitFor(() => expect(dispose.mock.calls.length).toBeGreaterThan(1));
        await vi.waitFor(() => expect(lx.snapshot().bootstrap.pending).toHaveLength(0));
        expect(sideEffect).toBe(false);
        // 根清理失败时保留诊断信息，不能提前创建下一轮模块实例。
        expect(lx.ready).toBe(false);
    });

    it("interrupts pending initialization without entering a World", async () => {
        let finish!: () => void;
        const entered = vi.fn();
        const starting = lx.init({ ...baseConfig, initialWorld: "lobby",
            register() { lx.worlds.register({ id: "lobby", initialize: entered }); },
            initialize: () => new Promise<void>(resolve => { finish = resolve; }),
            lifecycle: { pendingLoadTimeoutMs: 10, stopTimeoutMs: 100 },
        }).catch(error => error);
        await vi.waitFor(() => expect(finish).toBeDefined());
        await lx.stop().catch(() => {});
        expect(await starting).toBeInstanceOf(Error);
        expect(entered).not.toHaveBeenCalled();
        finish();
        await vi.waitFor(() => expect(lx.snapshot().bootstrap.pending).toHaveLength(0));
    });

    it("honors injected platform, HTTP and purchase implementations and saved audio settings", async () => {
        const platform: PlatformService = { name: "platform:test", kind: "native", viewport: { width: 720, height: 1280 },
            start: vi.fn(), stop: vi.fn(), nowMs: () => 123, openExternalUrl() {} };
        const http: HttpTransport = { request: vi.fn() };
        const purchase = { supported: false } as unknown as PurchasePlatform;
        await lx.init({ ...baseConfig, platform, http, purchase });
        expect(lx.platform).toBe(platform);
        expect(lx.http).toBe(http);
        expect(lx.purchase).toBe(purchase);
        lx.storage.save({ language: "en-US", muted: true, musicVolume: 0.25, soundVolume: 0.5 });
        await lx.stop();
        await lx.init(baseConfig);
        expect(lx.audio.settings).toEqual({ muted: true, musicVolume: 0.25, soundVolume: 0.5 });
        expect(platform.stop).toHaveBeenCalledOnce();
    });

    it("cleans modules when platform startup fails", async () => {
        const platform: PlatformService = { name: "platform:broken", kind: "native", viewport: { width: 720, height: 1280 },
            start() { throw new Error("platform unavailable"); }, stop: vi.fn(), nowMs: () => 0, openExternalUrl() {} };
        await expect(lx.init({ ...baseConfig, platform })).rejects.toThrow("platform unavailable");
        expect(lx.ready).toBe(false);
        expect(platform.stop).toHaveBeenCalledOnce();
        expect(() => lx.net).toThrow("stopped");
    });

    it.each([
        { kind: "web" as const, environment: {}, browser: {}, style: "css" },
        { kind: "web" as const, environment: { isEditor: true }, browser: {}, style: "laya-editor" },
        { kind: "mini-game" as const, environment: {}, browser: { onWXMiniGame: true, onDevTools: true }, style: "css" },
        { kind: "mini-game" as const, environment: {}, browser: {}, style: "plain" },
        { kind: "native" as const, environment: {}, browser: {}, style: "plain" },
    ])("selects $style diagnostics for $kind", async ({ kind, environment, browser, style }) => {
        const original = Laya;
        vi.stubGlobal("Laya", { ...original, LayaEnv: environment, Browser: browser });
        try {
            const platform: PlatformService = { name: "platform:logging-test", kind, viewport: { width: 720, height: 1280 },
                start() {}, stop() {}, nowMs: () => 0, openExternalUrl() {} };
            lx.logger.enabled = false;
            await lx.init({ ...baseConfig, platform });
            expect(lx.logger.style).toBe(style);
            expect(lx.logger.enabled).toBe(false);
            await lx.stop();
        } finally { lx.logger.enabled = true; vi.stubGlobal("Laya", original); }
    });

    it("loads the callable example configuration with root data and initial Lobby", async () => {
        const { EXAMPLE_INVENTORY_DATA } = await import("../../../src/game/logic/application/ExampleDataKeys");
        const { ExampleInventoryData } = await import("../../../src/game/logic/infrastructure/examples/ExampleInventoryData");
        await lx.init(new GameApplication());
        expect(lx.ready).toBe(true);
        expect(lx.snapshot().synchronization.source).toBe("development-simulator");
        const account = lx.data.get(EXAMPLE_INVENTORY_DATA);
        expect(account).toBeInstanceOf(ExampleInventoryData);
        expect(account.totalQuantity).toBeGreaterThan(0);
        expect(lx.scenes.get("examples.lobby")).toBeDefined();
        await lx.worlds.exit("examples.lobby");
        expect(lx.data.get(EXAMPLE_INVENTORY_DATA)).toBe(account);
        await lx.stop();
        expect(clearRes).toHaveBeenCalledWith("bootstrap/tables/tbtableappconfig.bin");
        expect(clearRes).toHaveBeenCalledWith("bootstrap/config/runtime.json");
        expect(account.totalQuantity).toBe(0);
    });

    it("loads the configured Tip prefab", async () => {
        await lx.init({ tipPrefabUrl: "bootstrap/ui/CustomTip.lh" });
        const node = new FakeGWidget();
        vi.mocked(Laya.loader.load).mockResolvedValueOnce(new FakePrefab(() => node));
        const tip = await lx.pool.acquire("lx.ui.tip");
        expect(tip).toBe(node);
        expect(vi.mocked(Laya.loader.load).mock.lastCall?.[0]).toBe("bootstrap/ui/CustomTip.lh");
        lx.pool.release("lx.ui.tip", tip);
    });

    it("stops game data before native resource collection", async () => {
        const events: string[] = [];
        sceneGc.mockImplementationOnce(() => { events.push("gc"); });
        await lx.init({ ...baseConfig, dispose() { events.push("game"); } });
        await lx.stop();
        expect(events).toEqual(["game", "gc"]);
    });

    it("waits for native component destruction before requesting GC", async () => {
        await lx.init(baseConfig);
        let finishFrame: (() => void) | undefined;
        vi.spyOn(Laya.timer, "frameOnce").mockImplementation((_delay, caller, method) => {
            finishFrame = () => method.call(caller);
        });
        const stopping = lx.stop();
        await vi.waitFor(() => expect(finishFrame).toBeDefined());
        expect(sceneGc).not.toHaveBeenCalled();
        finishFrame!();
        await stopping;
        expect(sceneGc).toHaveBeenCalledOnce();
    });

    it("skips GC when rendering is suspended", async () => {
        await lx.init({ ...baseConfig, lifecycle: { pendingLoadTimeoutMs: 20, stopTimeoutMs: 100 } });
        vi.spyOn(Laya.timer, "frameOnce").mockImplementation(() => {});
        await expect(lx.stop()).rejects.toThrow();
        expect(sceneGc).not.toHaveBeenCalled();
        expect(lx.snapshot()).toMatchObject({ pendingCleanup: [], gc: "skipped" });
    });

    it("continues cleanup after a module throws", async () => {
        await lx.init(baseConfig);
        const events: string[] = [];
        vi.spyOn(lx.ui, "dispose").mockImplementationOnce(() => { events.push("ui"); throw new Error("ui cleanup failed"); })
            .mockImplementation(() => { events.push("ui-retry"); });
        vi.spyOn(lx.ui, "waitForPendingLoads").mockImplementation(async () => { events.push("pending-ui"); });
        vi.spyOn(lx.audio, "dispose").mockImplementation(() => { events.push("audio"); });
        await expect(lx.stop()).rejects.toThrow();
        expect(events).toEqual(["ui", "audio", "pending-ui", "ui-retry"]);
        expect(lx.ready).toBe(false);
        await expect(lx.init(baseConfig)).rejects.toThrow("cleanup remains incomplete");
    });

    it("invalidates owners before bounded waiting on unresolved resources", async () => {
        await lx.init({ ...baseConfig, lifecycle: { pendingLoadTimeoutMs: 20, stopTimeoutMs: 100 } });
        const audioStop = vi.spyOn(lx.audio, "dispose");
        let release!: () => void;
        vi.spyOn(lx.ui, "waitForPendingLoads").mockReturnValue(new Promise<void>(resolve => { release = resolve; }));
        await expect(lx.stop()).rejects.toThrow();
        expect(audioStop).toHaveBeenCalledOnce();
        expect(sceneGc).not.toHaveBeenCalled();
        expect(lx.snapshot()).toMatchObject({ pendingCleanup: ["ui"], gc: "skipped" });
        await expect(lx.init(baseConfig)).rejects.toThrow("cleanup remains incomplete");
        release();
        await vi.waitFor(() => expect(lx.snapshot().pendingCleanup).toEqual([]));
    });
});
