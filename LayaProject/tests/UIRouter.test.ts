import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BindingToken } from "../src/framework/application/ui/AsyncBindingGuard";
import type { BaseGameWindow as BaseGameWindowType } from "../src/framework/presentation/ui/BaseGameWindow";
import type { UIRoute, UIRouter as UIRouterType } from "../src/framework/presentation/ui/UIRouter";
import { UILayer } from "../src/framework/presentation/ui/UILayer";

class FakeGWidget {
    destroyed = false;
    zOrder = 0;

    destroy(): void {
        this.destroyed = true;
    }
}

class FakeGWindow extends FakeGWidget {
    contentPane!: FakeGWidget;
    isShowing = false;
    modal = false;
    parent?: { getChildIndex(child: unknown): number };

    show(): void {
        this.isShowing = true;
    }

    hide(): void {
        if (!this.isShowing) return;
        this.isShowing = false;
        (this as unknown as { onHide(): void }).onHide();
    }

    protected onHide(): void {}

    override destroy(): void {
        if (this.destroyed) return;
        this.hide();
        this.contentPane?.destroy();
        super.destroy();
    }
}

const loaderLoad = vi.fn();
const root = { modalLayer: new FakeGWidget() };
vi.stubGlobal("Laya", {
    GWidget: FakeGWidget,
    GWindow: FakeGWindow,
    GRoot: { inst: root },
    Loader: { HIERARCHY: "HIERARCHY" },
    loader: { load: loaderLoad },
});
const { UIRouter } = await import("../src/framework/presentation/ui/UIRouter") as { UIRouter: typeof UIRouterType };
const { BaseGameWindow } = await import("../src/framework/presentation/ui/BaseGameWindow") as {
    BaseGameWindow: typeof BaseGameWindowType;
};

beforeEach(() => {
    loaderLoad.mockReset();
    root.modalLayer.zOrder = 0;
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

    it("waits for an in-flight request and destroys its superseded prefab", async () => {
        let finishLoad!: (value: Laya.Prefab) => void;
        loaderLoad.mockReturnValue(new Promise<Laya.Prefab>((resolve) => { finishLoad = resolve; }));
        const content = new FakeGWidget();
        const router = new UIRouter();
        router.register(route("late", (pane) => new TestWindow(pane)));

        const show = router.show("late", "args");
        router.dispose();
        finishLoad(prefab(content));

        await expect(show).rejects.toThrow("superseded");
        await router.waitForPendingLoads();
        expect(content.destroyed).toBe(true);
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
});
