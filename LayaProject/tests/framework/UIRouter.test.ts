import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BindingToken } from "../../src/framework/application/ui/AsyncBindingGuard";
import type { BaseGameWindow as BaseGameWindowType } from "../../src/framework/presentation/ui/BaseGameWindow";
import type { UIRoute, UIRouter as UIRouterType } from "../../src/framework/presentation/ui/UIRouter";
import { UILayer } from "../../src/framework/presentation/ui/UILayer";

class FakeGWidget {
    destroyed = false;
    zOrder = 0;
    parent?: FakeRoot;

    removeSelf(): this {
        this.parent?.removeChild(this);
        return this;
    }

    destroy(): void {
        this.destroyed = true;
    }
}

class FakeGWindow extends FakeGWidget {
    contentPane!: FakeGWidget;
    isShowing = false;
    modal = false;
    show(): void {
        this.isShowing = true;
        root.showWindow(this);
    }

    hide(): void {
        if (!this.isShowing) return;
        this.isShowing = false;
        root.removeChild(this);
        (this as unknown as { onHide(): void }).onHide();
        root.adjustModalLayer();
    }

    bringToFront(): void { root.bringToFront(this); }

    protected onHide(): void {}

    override destroy(): void {
        if (this.destroyed) return;
        this.hide();
        this.contentPane?.destroy();
        super.destroy();
    }
}

class FakeRoot {
    readonly children: FakeGWidget[] = [];
    readonly modalLayer = new FakeGWidget();
    getChildIndex(child: FakeGWidget): number { return this.children.indexOf(child); }
    addChildAt(child: FakeGWidget, index: number): void {
        child.removeSelf();
        this.children.splice(index, 0, child);
        child.parent = this;
    }
    removeChild(child: FakeGWidget): void {
        const index = this.getChildIndex(child);
        if (index >= 0) this.children.splice(index, 1);
        child.parent = undefined;
    }
    setChildIndex(child: FakeGWidget, index: number): void {
        this.children.splice(this.getChildIndex(child), 1);
        this.children.splice(index, 0, child);
    }
    setChildIndexBefore(child: FakeGWidget, index: number): void {
        this.setChildIndex(child, this.getChildIndex(child) < index ? index - 1 : index);
    }
    showWindow(window: FakeGWindow): void {
        this.addChildAt(window, this.children.length);
        this.adjustModalLayer();
    }
    adjustModalLayer(): void {
        const modal = [...this.children].reverse()
            .find((child) => child instanceof FakeGWindow && child.modal);
        if (!modal) { this.modalLayer.removeSelf(); return; }
        if (this.modalLayer.parent) this.setChildIndexBefore(this.modalLayer, this.getChildIndex(modal));
        else this.addChildAt(this.modalLayer, this.getChildIndex(modal));
    }
    bringToFront(window: FakeGWindow): void {
        let index = this.modalLayer.parent && !window.modal
            ? this.getChildIndex(this.modalLayer) - 1 : this.children.length - 1;
        for (; index >= 0; index -= 1) {
            if (this.children[index] === window) return;
            if (this.children[index] instanceof FakeGWindow) break;
        }
        if (index >= 0) this.setChildIndex(window, index);
    }
    flushZOrder(): void { this.children.sort((left, right) => left.zOrder - right.zOrder); }
}

const loaderLoad = vi.fn();
const root = new FakeRoot();
vi.stubGlobal("Laya", {
    GWidget: FakeGWidget,
    GWindow: FakeGWindow,
    GRoot: { inst: root },
    Loader: { HIERARCHY: "HIERARCHY" },
    loader: { load: loaderLoad },
});
const { UIRouter } = await import("../../src/framework/presentation/ui/UIRouter") as { UIRouter: typeof UIRouterType };
const { BaseGameWindow } = await import("../../src/framework/presentation/ui/BaseGameWindow") as {
    BaseGameWindow: typeof BaseGameWindowType;
};

beforeEach(() => {
    loaderLoad.mockReset();
    root.modalLayer.zOrder = 0;
    for (const child of [...root.children]) root.removeChild(child);
});

afterAll(() => vi.unstubAllGlobals());

class TestWindow extends BaseGameWindow<string> {
    constructor(
        contentPane: Laya.GWidget,
        private readonly bind: (args: string, token: BindingToken) => void | Promise<void> = () => {},
    ) {
        super(contentPane);
    }

    protected onBind(args: string, token: BindingToken): void | Promise<void> {
        return this.bind(args, token);
    }

    track(cleanup: () => void): void { this.presentation.defer(cleanup); }
}

class RetryDestroyWindow extends TestWindow {
    destroyAttempts = 0;

    override destroy(): void {
        this.destroyAttempts += 1;
        if (this.destroyAttempts === 1) {
            throw new Error("destroy failed");
        }
        super.destroy();
    }
}

function route(
    id: string,
    create: (contentPane: Laya.GWidget) => TestWindow,
    multiplicity: "singleton" | "multiple" = "singleton",
    retention: "hide" | "destroy" = "destroy",
): UIRoute<string> {
    return {
        id,
        url: `ui/${id}.lh`,
        multiplicity,
        retention,
        create,
    };
}

function prefab(content: FakeGWidget = new FakeGWidget()): Laya.Prefab {
    return { create: () => content } as unknown as Laya.Prefab;
}

describe("UIRouter", () => {
    it("rejects the unrecoverable multiple + hide policy", () => {
        const router = new UIRouter();
        expect(() => router.register(route(
            "invalid",
            (content) => new TestWindow(content),
            "multiple",
            "hide",
        ))).toThrow("cannot combine");
    });

    it("destroys prefab content when the route factory throws", async () => {
        const content = new FakeGWidget();
        loaderLoad.mockResolvedValue(prefab(content));
        const router = new UIRouter();
        router.register(route("factory-error", () => { throw new Error("factory failed"); }));

        await expect(router.show("factory-error", "args")).rejects.toThrow("factory failed");
        expect(content.destroyed).toBe(true);
    });

    it("destroys and untracks the latest window when binding throws", async () => {
        loaderLoad.mockImplementation(() => Promise.resolve(prefab()));
        const windows: TestWindow[] = [];
        let fail = true;
        const router = new UIRouter();
        router.register(route("bind-error", (content) => {
            const window = new TestWindow(content, () => {
                if (fail) throw new Error("bind failed");
            });
            windows.push(window);
            return window;
        }));

        await expect(router.show("bind-error", "first")).rejects.toThrow("bind failed");
        expect(windows[0].destroyed).toBe(true);
        fail = false;
        expect(await router.show("bind-error", "second")).toBe(windows[1]);
    });

    it("rejects a close target owned by another route", async () => {
        loaderLoad.mockImplementation(() => Promise.resolve(prefab()));
        const router = new UIRouter();
        router.register(route("first", (content) => new TestWindow(content), "multiple"));
        router.register(route("second", (content) => new TestWindow(content), "multiple"));
        const first = await router.show("first", "first");
        const second = await router.show("second", "second");

        expect(() => router.close("first", second as unknown as BaseGameWindowType<unknown>))
            .toThrow("does not belong");
        expect(first.destroyed).toBe(false);
        expect(second.destroyed).toBe(false);
    });

    it("cancels a pending show without instantiating its late prefab and still waits for the native load", async () => {
        let finishLoad!: (value: Laya.Prefab) => void;
        loaderLoad.mockReturnValue(new Promise<Laya.Prefab>((resolve) => { finishLoad = resolve; }));
        const create = vi.fn(() => new FakeGWidget());
        const router = new UIRouter();
        router.register(route("late", (pane) => new TestWindow(pane)));

        const show = router.show("late", "args");
        router.dispose();
        await expect(show).rejects.toThrow("superseded");
        expect(router.snapshot()).toMatchObject({ pendingRequests: [], nativeLoads: 1 });
        let settled = false;
        const waiting = router.waitForPendingLoads().then(() => { settled = true; });
        await Promise.resolve();
        expect(settled).toBe(false);
        finishLoad({ create } as unknown as Laya.Prefab);
        await waiting;
        await router.waitForPendingLoads();
        expect(create).not.toHaveBeenCalled();
        expect(router.snapshot().nativeLoads).toBe(0);
    });

    it("uses GRoot ordering and tracks hidden retained windows", async () => {
        loaderLoad.mockResolvedValue(prefab());
        const router = new UIRouter();
        router.register({
            ...route("reusable", (content) => new TestWindow(content), "singleton", "hide"),
            layer: UILayer.Popup,
        });

        const window = await router.show("reusable", "first");
        expect(router.getTop()?.window).toBe(window);
        window.hide();
        expect(router.listVisible()).toEqual([]);
        expect(router.listManaged()[0].state).toBe("hidden-retained");

        expect(await router.show("reusable", "second")).toBe(window);
        expect(loaderLoad).toHaveBeenCalledOnce();
    });

    it("turns native hide into one non-reentrant destruction", async () => {
        loaderLoad.mockResolvedValue(prefab());
        const router = new UIRouter();
        router.register(route("transient", (content) => new TestWindow(content)));
        const window = await router.show("transient", "args");
        const destroy = vi.spyOn(window, "destroy");

        window.hide();

        expect(window.destroyed).toBe(true);
        expect(destroy).toHaveBeenCalledOnce();
        expect(router.listManaged()).toEqual([]);
    });

    it("keeps the ui2 modal layer aligned with the highest modal route", async () => {
        loaderLoad.mockResolvedValue(prefab());
        const router = new UIRouter();
        router.register({
            ...route("popup", (content) => new TestWindow(content)),
            layer: UILayer.Popup,
            modal: true,
        });

        const window = await router.show("popup", "args");
        expect(root.modalLayer.zOrder).toBe(window.zOrder);
        router.close("popup");
        expect(root.modalLayer.zOrder).toBe(0);
    });

    it("reports in-flight route loads", async () => {
        let finishLoad!: (value: Laya.Prefab) => void;
        loaderLoad.mockReturnValue(new Promise<Laya.Prefab>((resolve) => { finishLoad = resolve; }));
        const router = new UIRouter();
        router.register(route("loading", (content) => new TestWindow(content)));

        const show = router.show("loading", "args");
        expect(router.snapshot().loading).toEqual({ loading: 1 });
        finishLoad(prefab());
        await show;
        expect(router.snapshot().loading).toEqual({});
    });

    it("continues disposing other windows and can retry a failed destroy", async () => {
        loaderLoad.mockImplementation(() => Promise.resolve(prefab()));
        const router = new UIRouter();
        let first = true;
        router.register(route("cleanup", (content) => {
            if (first) {
                first = false;
                return new RetryDestroyWindow(content);
            }
            return new TestWindow(content);
        }, "multiple"));
        const failed = await router.show("cleanup", "first") as RetryDestroyWindow;
        const normal = await router.show("cleanup", "second");

        expect(() => router.dispose()).toThrow("failed to clean up");
        expect(normal.destroyed).toBe(true);
        expect(failed.destroyed).toBe(false);
        expect(() => router.dispose()).not.toThrow();
        expect(failed.destroyed).toBe(true);
        expect(failed.destroyAttempts).toBe(2);
    });

    it.each(["old-first", "new-first", "old-reject"])(
        "isolates overlapping singleton presentations: %s", async (order) => {
            loaderLoad.mockResolvedValue(prefab());
            const router = new UIRouter();
            const waits = new Map<string, { resolve(): void; reject(error: Error): void }>();
            const cleaned: string[] = [];
            let window!: TestWindow;
            router.register(route("overlap", (content) => {
                window = new TestWindow(content, (args) => {
                    if (args === "initial") return;
                    window.track(() => cleaned.push(args));
                    return new Promise<void>((resolve, reject) => waits.set(args, { resolve, reject }));
                });
                return window;
            }, "singleton", "hide"));
            await router.show("overlap", "initial");
            const first = router.show("overlap", "first");
            const firstResult = first.catch((error: unknown) => error);
            const second = router.show("overlap", "second");
            if (order === "new-first") {
                waits.get("second")!.resolve();
                await second;
                waits.get("first")!.resolve();
            } else {
                if (order === "old-reject") waits.get("first")!.reject(new Error("old failure"));
                else waits.get("first")!.resolve();
                await firstResult;
                waits.get("second")!.resolve();
            }
            expect(await second).toBe(window);
            expect(await firstResult).toBeInstanceOf(Error);
            expect(cleaned).toEqual(["first"]);
            expect(window.destroyed).toBe(false);
            router.close("overlap");
            expect(cleaned).toEqual(["first", "second"]);
        },
    );

    it.each(["close", "dispose", "signal"])(
        "settles an uncooperative binding on %s and consumes its late rejection", async (action) => {
            loaderLoad.mockResolvedValue(prefab());
            const router = new UIRouter();
            let fail!: (error: Error) => void;
            let signal!: AbortSignal;
            router.register(route("pending-bind", (content) => new TestWindow(content, (_args, token) => {
                signal = token.signal;
                return new Promise<void>((_resolve, reject) => { fail = reject; });
            })));
            const controller = new AbortController();
            const show = router.show("pending-bind", "args", { signal: controller.signal });
            const result = show.catch((error: unknown) => error);
            await vi.waitFor(() => expect(fail).toBeTypeOf("function"));
            expect(router.snapshot().pendingRequests).toEqual([
                expect.objectContaining({ routeId: "pending-bind", phase: "binding" }),
            ]);
            if (action === "close") router.close("pending-bind");
            else if (action === "dispose") router.dispose();
            else controller.abort();
            const settled = await Promise.race([result, new Promise((resolve) => setTimeout(() => resolve("timeout"), 100))]);
            expect(settled).toBeInstanceOf(Error);
            expect(signal.aborted).toBe(true);
            expect(router.snapshot().pendingRequests).toEqual([]);
            await router.waitForPendingLoads();
            fail(new Error("late failure"));
            await Promise.resolve();
        },
    );

    it.each([[UILayer.System, UILayer.Popup], [UILayer.Popup, UILayer.System], [UILayer.Popup, UILayer.Popup]])(
        "keeps the modal below the top window after %i then %i and native bringToFront", async (firstLayer, secondLayer) => {
            loaderLoad.mockImplementation(() => Promise.resolve(prefab()));
            const router = new UIRouter();
            router.register({ ...route("first-modal", (pane) => new TestWindow(pane)), layer: firstLayer, modal: true });
            router.register({ ...route("second-modal", (pane) => new TestWindow(pane)), layer: secondLayer, modal: true });
            const first = await router.show("first-modal", "first");
            root.flushZOrder();
            const second = await router.show("second-modal", "second");
            root.flushZOrder();
            const assertOrder = () => {
                const top = router.getTop()!.window as unknown as FakeGWindow;
                expect(root.getChildIndex(root.modalLayer)).toBe(root.getChildIndex(top) - 1);
                expect(root.modalLayer.zOrder).toBe(top.zOrder);
            };
            assertOrder();
            first.bringToFront();
            root.flushZOrder();
            assertOrder();
            if (firstLayer === secondLayer) expect(router.getTop()?.window).toBe(first);
            second.bringToFront();
            root.flushZOrder();
            assertOrder();
            router.closeTop();
            root.flushZOrder();
            assertOrder();
            router.dispose();
        },
    );

    it("uses registered route objects as typed keys while preserving string calls", async () => {
        loaderLoad.mockResolvedValue(prefab());
        const router = new UIRouter();
        const registered = router.register(route("typed", (pane) => new TestWindow(pane)));
        expect(await router.show(registered, "valid")).toBeInstanceOf(TestWindow);
        function typeAssertions(): void {
            // @ts-expect-error A typed route must reject unrelated argument types.
            void router.show(registered, { unrelated: 1 });
            // @ts-expect-error A typed route does not accept a number instead of its string args.
            void router.show(registered, 1);
        }
        void typeAssertions;
        router.dispose();
    });

    it("preserves hide retention when closing a binding and allows reopening the same window", async () => {
        loaderLoad.mockResolvedValue(prefab());
        const router = new UIRouter();
        let window!: TestWindow;
        let started = false;
        router.register(route("retained-bind", (pane) => {
            window = new TestWindow(pane, (args) => {
                if (args === "wait") { started = true; return new Promise<void>(() => {}); }
            });
            return window;
        }, "singleton", "hide"));
        const show = router.show("retained-bind", "wait");
        const result = show.catch((error: unknown) => error);
        await vi.waitFor(() => expect(started).toBe(true));
        router.close("retained-bind");
        expect(await result).toBeInstanceOf(Error);
        expect(window.destroyed).toBe(false);
        expect(router.listManaged()[0].state).toBe("hidden-retained");
        expect(await router.show("retained-bind", "ready")).toBe(window);
        expect(loaderLoad).toHaveBeenCalledOnce();
        router.dispose();
    });

    it("does not supersede the active binding for an already-aborted show", async () => {
        loaderLoad.mockResolvedValue(prefab());
        const router = new UIRouter();
        let finish!: () => void;
        router.register(route("preabort", (pane) => new TestWindow(pane, () => new Promise<void>((resolve) => {
            finish = resolve;
        }))));
        const first = router.show("preabort", "first");
        await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
        const controller = new AbortController();
        controller.abort();
        await expect(router.show("preabort", "aborted", { signal: controller.signal })).rejects.toThrow("cancelled");
        finish();
        await expect(first).resolves.toBeInstanceOf(TestWindow);
        router.dispose();
    });

    it("still hides a retained window when a presentation cleanup throws", async () => {
        loaderLoad.mockResolvedValue(prefab());
        const router = new UIRouter();
        let window!: TestWindow;
        router.register(route("cleanup-hide", (pane) => {
            window = new TestWindow(pane, () => window.track(() => { throw new Error("cleanup failed"); }));
            return window;
        }, "singleton", "hide"));
        await router.show("cleanup-hide", "first");
        expect(() => router.close("cleanup-hide")).toThrow("cleanup operation");
        expect(window.isShowing).toBe(false);
        expect(router.listManaged()[0].state).toBe("hidden-retained");
        router.dispose();
    });

    it.each(["router", "native"])("retains a partial native destruction after %s destruction and rejects false recovery", async (action) => {
        loaderLoad.mockImplementation(() => Promise.resolve(prefab()));
        const router = new UIRouter();
        router.register(route("partial-destroy", (pane) => new TestWindow(pane), "multiple"));
        const partial = await router.show("partial-destroy", "first");
        const normal = await router.show("partial-destroy", "second");
        const content = partial.contentPane;
        const nativeDestroy = vi.spyOn(FakeGWindow.prototype, "destroy").mockImplementationOnce(function (this: FakeGWindow) {
            this.hide();
            // Laya Node.destroy sets its destroyed flag before components and children finish.
            this.destroyed = true;
            throw new Error("native onDisable failed before destroying children");
        });
        try {
            if (action === "native") expect(() => partial.destroy()).toThrow("cleanup operation");
            expect(() => router.dispose()).toThrow("failed to clean up");
            expect(partial.destroyed).toBe(true);
            expect(content.destroyed).toBe(false);
            expect(normal.destroyed).toBe(true);
            expect(router.snapshot()).toMatchObject({ cleanupFailures: 1 });
            expect(router.listManaged()[0].state).toBe("cleanup-failed");
            expect(router.cleanupDiagnostics()).toEqual([
                expect.objectContaining({ routeId: "partial-destroy", retryable: false, attempts: 1 }),
            ]);
            expect(() => router.dispose()).toThrow("failed to clean up");
            expect(() => partial.destroy()).toThrow("cleanup operation");
            expect(nativeDestroy).toHaveBeenCalledTimes(2);
            expect(content.destroyed).toBe(false);
        } finally {
            nativeDestroy.mockRestore();
            content.destroy();
        }
    });
});
