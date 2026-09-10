import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { RedDotStore as Store } from "../../src/framework/presentation/ui/RedDotStore";
import type { RedDotBinding as Binding } from "../../src/framework/presentation/ui/RedDotBinding";

class FakeEventDispatcher {
    private readonly listeners = new Map<string, Array<{ caller: unknown; listener: (value: number) => void }>>();
    on(key: string, caller: unknown, listener: (value: number) => void): this {
        const listeners = this.listeners.get(key) ?? [];
        listeners.push({ caller, listener });
        this.listeners.set(key, listeners);
        return this;
    }
    event(key: string, value: number): boolean {
        const listeners = this.listeners.get(key)?.slice() ?? [];
        for (const entry of listeners) entry.listener.call(entry.caller, value);
        return listeners.length > 0;
    }
    offAllCaller(caller: unknown): this {
        for (const [key, listeners] of this.listeners) {
            this.listeners.set(key, listeners.filter(entry => entry.caller !== caller));
        }
        return this;
    }
    off(key: string, caller: unknown, listener: (value: number) => void): this {
        this.listeners.set(key, (this.listeners.get(key) ?? []).filter(entry =>
            entry.caller !== caller || entry.listener !== listener));
        return this;
    }
    offAll(): this { this.listeners.clear(); return this; }
    hasListener(key: string): boolean { return (this.listeners.get(key)?.length ?? 0) > 0; }
}

class FakeSprite { visible = true; destroyed = false; }
class FakeText extends FakeSprite { text = ""; }

let RedDotStore: typeof Store;
let RedDotBinding: typeof Binding;
const bindings: Binding[] = [];
const later = new Map<unknown, () => void>();
function flushLater(): void {
    const callbacks = [...later];
    later.clear();
    for (const [caller, method] of callbacks) method.call(caller);
}

beforeAll(async () => {
    vi.stubGlobal("Laya", {
        EventDispatcher: FakeEventDispatcher,
        Script: class {},
        Sprite: FakeSprite,
        GTextField: FakeText,
        regClass: () => (target: unknown) => target,
        property: () => () => {},
        timer: {
            callLater(caller: unknown, method: () => void): void { later.set(caller, method); },
            clearCallLater(caller: unknown): void { later.delete(caller); },
        },
    });
    ({ RedDotStore } = await import("../../src/framework/presentation/ui/RedDotStore"));
    ({ RedDotBinding } = await import("../../src/framework/presentation/ui/RedDotBinding"));
});

afterEach(() => {
    for (const binding of bindings.splice(0)) binding.onDestroy();
    RedDotBinding.setDefaultStore(undefined);
    expect(later.size).toBe(0);
});

describe("RedDotStore", () => {
    it("aggregates independent leaf values and notifies only affected paths", () => {
        const store = new RedDotStore();
        const parent = vi.fn();
        const unrelated = vi.fn();
        store.on("bag", null, parent);
        store.on("mail", null, unrelated);
        store.set("bag/equipment/new", 2);
        store.set("bag/items/new", true);
        expect(store.get("bag")).toBe(3);
        expect(store.get("bag/equipment")).toBe(2);
        expect(parent.mock.calls).toEqual([[2], [3]]);
        expect(unrelated).not.toHaveBeenCalled();
        store.set("bag/equipment/new", 2);
        expect(parent).toHaveBeenCalledTimes(2);
        store.set("bag/items/new", false);
        expect(store.get("bag/items")).toBe(0);
        expect(store.get("bag")).toBe(2);
    });

    it("treats parent values as their own contribution without overwriting descendants", () => {
        const store = new RedDotStore();
        store.set("bag/new", 2);
        store.set("bag", true);
        expect(store.get("bag")).toBe(3);
        store.set("bag", false);
        expect(store.get("bag")).toBe(2);
        expect(store.get("bag/new")).toBe(2);
    });

    it("batches a snapshot so listeners observe final values and unchanged totals emit nothing", () => {
        const store = new RedDotStore();
        store.setMany({ "mail/unread": 2, "mail/rewards": 1 });
        const parent = vi.fn();
        const observed: number[] = [];
        store.on("mail", null, parent);
        store.on("mail/unread", null, () => observed.push(store.get("mail/rewards")));
        store.setMany({ "mail/unread": 1, "mail/rewards": 2 });
        expect(observed).toEqual([2]);
        expect(parent).not.toHaveBeenCalled();
        store.setMany({ "mail/unread": 4, "mail/rewards": 3 });
        expect(parent.mock.calls).toEqual([[7]]);
    });

    it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
        "rejects invalid value %s without partially applying a batch", value => {
            const store = new RedDotStore();
            store.set("bag/new", 1);
            expect(() => store.setMany({ "bag/new": 2, "mail/unread": value })).toThrow();
            expect(store.get("bag")).toBe(1);
            expect(store.get("mail")).toBe(0);
        },
    );

    it.each(["", "/bag", "bag/", "bag//new", " bag", "__proto__/new", "constructor", "toString"])("rejects invalid path %s", key => {
        const store = new RedDotStore();
        expect(() => store.set(key, true)).toThrow();
    });

    it("rejects aggregate overflow without committing leaf changes", () => {
        const store = new RedDotStore();
        store.set("bag/a", Number.MAX_SAFE_INTEGER);
        expect(() => store.set("bag/b", 1)).toThrow();
        expect(store.get("bag/b")).toBe(0);
        expect(store.get("bag")).toBe(Number.MAX_SAFE_INTEGER);
    });

    it("clears both direct and aggregate values and can be reused after logout", () => {
        const store = new RedDotStore();
        store.setMany({ "bag/new": 2, mail: true });
        const parent = vi.fn();
        store.on("bag", null, parent);
        store.clear();
        store.clear();
        expect(parent.mock.calls).toEqual([[0]]);
        expect(store.get("mail")).toBe(0);
        store.set("bag/new", 1);
        expect(parent.mock.calls).toEqual([[0], [1]]);
    });

    it("coalesces reentrant ancestor changes and skips cancelled notifications", () => {
        const store = new RedDotStore();
        const parent = vi.fn();
        store.on("bag", null, parent);
        store.on("bag/new", null, (value: number) => { if (value === 1) store.set("bag/new", 0); });
        store.set("bag/new", 1);
        expect(parent).not.toHaveBeenCalled();
        expect(store.get("bag")).toBe(0);
    });

    it("disposes during notification without leaving other badges stale", () => {
        const store = new RedDotStore();
        const mail = vi.fn();
        store.set("mail", 2);
        store.on("mail", null, mail);
        store.on("bag/new", null, (value: number) => { if (value > 0) store.dispose(); });
        store.set("bag/new", 1);
        expect(mail.mock.calls).toEqual([[0]]);
        expect(store.hasListener("mail")).toBe(false);
        expect(store.get("mail")).toBe(0);
        expect(() => store.set("mail", true)).toThrow("disposed");
        expect(() => store.dispose()).not.toThrow();
    });
});

describe("RedDotBinding", () => {
    it("validates IDE-configured keys before registering a native event listener", () => {
        const store = new RedDotStore();
        RedDotBinding.setDefaultStore(store);
        const binding = createBinding("__proto__");
        expect(() => binding.onEnable()).toThrow("native event name");
        expect(store.hasListener("__proto__")).toBe(false);
    });

    it("reads existing values on enable, caps text and detaches while disabled", () => {
        const store = new RedDotStore();
        store.set("mail/unread", 120);
        RedDotBinding.setDefaultStore(store);
        const binding = createBinding("mail");
        binding.onEnable();
        expect(binding.badge!.visible).toBe(true);
        expect(binding.countText!.text).toBe("99+");
        binding.onDisable();
        expect(store.hasListener("mail")).toBe(false);
        expect(binding.badge!.visible).toBe(false);
        store.set("mail/unread", 4);
        expect(binding.countText!.text).toBe("");
        binding.onEnable();
        expect(binding.countText!.text).toBe("4");
        store.set("mail/unread", 0);
        flushLater();
        expect(binding.badge!.visible).toBe(false);
    });

    it("rebinds a recycled row to a different key and local store without stale updates", () => {
        const appStore = new RedDotStore();
        const localStore = new RedDotStore();
        RedDotBinding.setDefaultStore(appStore);
        const binding = createBinding("items/a");
        binding.onEnable();
        localStore.set("items/b", 3);
        binding.bind(localStore, "items/b");
        expect(binding.countText!.text).toBe("3");
        expect(appStore.hasListener("items/a")).toBe(false);
        appStore.set("items/a", 4);
        expect(binding.countText!.text).toBe("3");
        binding.bind(localStore, "items/c");
        expect(localStore.hasListener("items/b")).toBe(false);
        localStore.set("items/b", 9);
        expect(binding.badge!.visible).toBe(false);
        localStore.set("items/c", 1);
        flushLater();
        expect(binding.countText!.text).toBe("1");
        binding.onDestroy();
        expect(localStore.hasListener("items/c")).toBe(false);
    });

    it("reads a replaced default on the next enable while explicit stores remain independent", () => {
        const first = new RedDotStore();
        const second = new RedDotStore();
        first.set("mail", 2);
        second.set("mail", 3);
        RedDotBinding.setDefaultStore(first);
        const defaultBinding = createBinding("mail");
        const explicitBinding = createBinding("mail");
        defaultBinding.onEnable();
        explicitBinding.bind(first);
        explicitBinding.onEnable();
        defaultBinding.onDisable();
        RedDotBinding.setDefaultStore(second);
        defaultBinding.onEnable();
        expect(defaultBinding.countText!.text).toBe("3");
        expect(explicitBinding.countText!.text).toBe("2");
        defaultBinding.onDisable();
        explicitBinding.onDisable();
        RedDotBinding.setDefaultStore(undefined);
        expect(defaultBinding.badge!.visible).toBe(false);
        expect(second.hasListener("mail")).toBe(false);
        first.dispose();
        expect(explicitBinding.badge!.visible).toBe(false);
        expect(first.hasListener("mail")).toBe(false);
    });

    it("supports a simple dot with no count label and tolerates destroyed references", () => {
        const store = new RedDotStore();
        const binding = createBinding("bag");
        binding.countText = null;
        binding.bind(store);
        binding.onEnable();
        store.set("bag/new", true);
        flushLater();
        expect(binding.badge!.visible).toBe(true);
        (binding.badge as unknown as FakeSprite).destroyed = true;
        expect(() => store.clear()).not.toThrow();
        expect(() => flushLater()).not.toThrow();
    });

    it("drops queued work when disabling before callLater and rereads the latest count on enable", () => {
        const store = new RedDotStore();
        store.set("mail", 1);
        const binding = createBinding("mail");
        binding.bind(store);
        binding.onEnable();
        store.set("mail", 2);
        expect(later.size).toBe(1);
        binding.onDisable();
        expect(later.size).toBe(0);
        store.set("mail", 3);
        binding.onEnable();
        expect(binding.countText!.text).toBe("3");
    });

    it("releases one IDE badge without detaching another badge for the same key", () => {
        const store = new RedDotStore();
        const first = createBinding("mail");
        const second = createBinding("mail");
        first.bind(store); second.bind(store);
        first.onEnable(); second.onEnable();
        store.set("mail", 2);
        first.onDestroy();
        expect(later.size).toBe(1);
        flushLater();
        expect(second.countText!.text).toBe("2");
        expect(store.hasListener("mail")).toBe(true);
        second.onDestroy();
        expect(store.hasListener("mail")).toBe(false);
    });
});

function createBinding(key: string): Binding {
    const binding = new RedDotBinding();
    binding.key = key;
    binding.badge = new FakeSprite() as unknown as Laya.Sprite;
    binding.countText = new FakeText() as unknown as Laya.GTextField;
    bindings.push(binding);
    return binding;
}
