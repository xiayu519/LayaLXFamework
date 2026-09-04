import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BindingToken } from "../src/framework/application/ui/AsyncBindingGuard";
import type { BaseGameWindow as BaseGameWindowType } from "../src/framework/presentation/ui/BaseGameWindow";
import type { ResourceGroupController } from "../src/framework/application/resource/ResourceGroup";
import type { UIRoute, UIRouter as UIRouterType } from "../src/framework/presentation/ui/UIRouter";
import { UILayer } from "../src/framework/presentation/ui/UILayer";

class FakeGWidget {
    destroyed = false;

    destroy(): void {
        this.destroyed = true;
    }
}

class FakeGWindow extends FakeGWidget {
    contentPane!: FakeGWidget;
    isShowing = false;

    show(): void {
        this.isShowing = true;
    }

    hide(): void {
        this.isShowing = false;
        (this as unknown as { onHide(): void }).onHide();
    }

    protected onHide(): void {}

    override destroy(): void {
        this.contentPane?.destroy();
        super.destroy();
    }
}

const loaderLoad = vi.fn();
vi.stubGlobal("Laya", {
    GWidget: FakeGWidget,
    GWindow: FakeGWindow,
    Loader: { HIERARCHY: "HIERARCHY" },
    loader: { load: loaderLoad },
});
const { UIRouter } = await import("../src/framework/presentation/ui/UIRouter") as { UIRouter: typeof UIRouterType };
const { BaseGameWindow } = await import("../src/framework/presentation/ui/BaseGameWindow") as {
    BaseGameWindow: typeof BaseGameWindowType;
};

beforeEach(() => {
    loaderLoad.mockReset();
});

afterAll(() => {
    vi.unstubAllGlobals();
});

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

function route(
    id: string,
    create: (contentPane: Laya.GWidget) => TestWindow,
    multiplicity: "singleton" | "multiple" = "singleton",
    retention: "hide" | "destroy" = "destroy",
): UIRoute<string> {
    return {
        id,
        url: `ui/${id}.lh`,
        group: `ui:${id}`,
        multiplicity,
        retention,
        create,
    };
}

function prefab(content: FakeGWidget = new FakeGWidget()): Laya.Prefab {
    return { create: () => content } as unknown as Laya.Prefab;
}

function resourceGroups() {
    const leases = new Map<string, number>();
    const controller: ResourceGroupController = {
        assign: vi.fn(),
        acquire(group) {
            leases.set(group, (leases.get(group) ?? 0) + 1);
            let released = false;
            return {
                group,
                get released() { return released; },
                release() {
                    if (released) return;
                    released = true;
                    leases.set(group, (leases.get(group) ?? 1) - 1);
                },
            };
        },
        releaseGroupIfUnused: vi.fn((group) => (leases.get(group) ?? 0) === 0),
    };
    return { controller, leases };
}

describe("UIRouter", () => {
    it("rejects the unrecoverable multiple + hide policy", () => {
        const router = new UIRouter(resourceGroups().controller);

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
        const router = new UIRouter(resourceGroups().controller);
        router.register(route("factory-error", () => {
            throw new Error("factory failed");
        }));

        await expect(router.show("factory-error", "args")).rejects.toThrow("factory failed");
        expect(content.destroyed).toBe(true);
    });

    it("destroys and untracks the latest window when binding throws", async () => {
        loaderLoad.mockImplementation(() => Promise.resolve(prefab()));
        const windows: TestWindow[] = [];
        let fail = true;
        const router = new UIRouter(resourceGroups().controller);
        router.register(route("bind-error", (content) => {
            const window = new TestWindow(content, () => {
                if (fail) {
                    throw new Error("bind failed");
                }
            });
            windows.push(window);
            return window;
        }));

        await expect(router.show("bind-error", "first")).rejects.toThrow("bind failed");
        expect(windows[0].destroyed).toBe(true);

        fail = false;
        const second = await router.show("bind-error", "second");
        expect(second).toBe(windows[1]);
        expect(windows).toHaveLength(2);
    });

    it("rejects a close target owned by another route", async () => {
        loaderLoad.mockImplementation(() => Promise.resolve(prefab()));
        const router = new UIRouter(resourceGroups().controller);
        router.register(route("first", (content) => new TestWindow(content), "multiple"));
        router.register(route("second", (content) => new TestWindow(content), "multiple"));
        const first = await router.show("first", "first");
        const second = await router.show("second", "second");

        expect(() => router.close("first", second as unknown as BaseGameWindowType<unknown>))
            .toThrow("does not belong");
        expect(first.destroyed).toBe(false);
        expect(second.destroyed).toBe(false);
    });

    it("waits for an in-flight request to reject and destroy its late prefab", async () => {
        let finishLoad!: (value: Laya.Prefab) => void;
        loaderLoad.mockReturnValue(new Promise<Laya.Prefab>((resolve) => { finishLoad = resolve; }));
        const content = new FakeGWidget();
        const router = new UIRouter(resourceGroups().controller);
        router.register(route("late", (pane) => new TestWindow(pane)));

        const show = router.show("late", "args");
        router.dispose();
        finishLoad(prefab(content));

        await expect(show).rejects.toThrow("superseded");
        await router.waitForPendingLoads();
        expect(content.destroyed).toBe(true);
        expect(() => router.register(route("after-dispose", (pane) => new TestWindow(pane))))
            .toThrow("disposed");
    });

    it("keeps GRoot as the window stack source and tracks hidden retained windows", async () => {
        loaderLoad.mockResolvedValue(prefab());
        const resources = resourceGroups();
        const router = new UIRouter(resources.controller);
        const reusable = route("reusable", (content) => new TestWindow(content), "singleton", "hide");
        router.register({ ...reusable, layer: UILayer.Popup });

        const window = await router.show("reusable", "first");
        expect(router.getTop()?.window).toBe(window);
        expect(router.snapshot().managed[0]).toMatchObject({
            routeId: "reusable",
            layer: UILayer.Popup,
            state: "visible",
        });

        window.hide();
        expect(router.listVisible()).toEqual([]);
        expect(router.listManaged()[0].state).toBe("hidden-retained");
        expect(resources.leases.get("ui:reusable")).toBe(1);

        expect(await router.show("reusable", "second")).toBe(window);
        expect(loaderLoad).toHaveBeenCalledOnce();
    });

    it("turns a native hide into destruction for destroy-retained routes", async () => {
        loaderLoad.mockResolvedValue(prefab());
        const resources = resourceGroups();
        const router = new UIRouter(resources.controller);
        router.register(route("transient", (content) => new TestWindow(content)));
        const window = await router.show("transient", "args");

        window.hide();

        expect(window.destroyed).toBe(true);
        expect(router.listManaged()).toEqual([]);
        expect(resources.leases.get("ui:transient")).toBe(0);
        expect(resources.controller.releaseGroupIfUnused).toHaveBeenCalledWith("ui:transient");
    });

    it("reports in-flight route loads", async () => {
        let finishLoad!: (value: Laya.Prefab) => void;
        loaderLoad.mockReturnValue(new Promise<Laya.Prefab>((resolve) => { finishLoad = resolve; }));
        const router = new UIRouter(resourceGroups().controller);
        router.register(route("loading", (content) => new TestWindow(content)));

        const show = router.show("loading", "args");
        expect(router.snapshot().loading).toEqual({ loading: 1 });
        finishLoad(prefab());
        await show;
        expect(router.snapshot().loading).toEqual({});
    });
});
