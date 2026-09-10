import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const transitionTimeline: string[] = [];
const sceneGc = vi.fn(() => transitionTimeline.push("gc"));
const factories = new Map<string, () => FakeScene>();
let slowSceneResolve: ((prefab: FakePrefab) => void) | undefined;
let failedResourceUrl: string | undefined;

class FakeScene {
    static gc(): void { sceneGc(); }

    autoDestroyAtClosed = false;
    destroyed = false;
    parent: object | null = null;

    open(_closeOther?: boolean, param?: unknown): void {
        this.parent = {};
        this.onOpened(param);
    }

    close(reason?: string): void {
        this.onClosed(reason);
        this.parent = null;
        if (this.autoDestroyAtClosed) this.destroy();
    }

    destroy(): void {
        this.destroyed = true;
        this.parent = null;
    }

    onOpened(_param: unknown): void {}
    onClosed(_reason?: string): void {}
}

class FakePrefab {
    constructor(private readonly factory: () => FakeScene) {}
    create(): FakeScene { return this.factory(); }
}

const load = vi.fn(async (
    input: string | Array<{ url: string }>,
    _options?: unknown,
    progress?: (value: number) => void,
): Promise<unknown> => {
    if (typeof input === "string") {
        transitionTimeline.push(`load:${input}`);
        if (input === "slow.ls") {
            return new Promise<FakePrefab>((resolve) => { slowSceneResolve = resolve; });
        }
        progress?.(0.4);
        progress?.(1);
        const factory = factories.get(input);
        return factory ? new FakePrefab(factory) : null;
    }
    progress?.(0.5);
    progress?.(1);
    return input.map(({ url }) => url === failedResourceUrl ? null : { url });
});

vi.stubGlobal("Laya", { property: () => () => {},
    Scene: FakeScene,
    Prefab: FakePrefab,
    Loader: { HIERARCHY: "HIERARCHY" },
    loader: { load },
    timer: {
        frameOnce: (_delay: number, caller: unknown, method: () => void) => method.call(caller),
    },
});

const {
    BaseGameScene,
} = await import("../../src/framework/presentation/scene/BaseGameScene");
const {
    SceneFlow,
    SceneTransitionCancelledError,
} = await import("../../src/framework/presentation/scene/SceneFlow");
type SceneLoadingPresenter = import("../../src/framework/presentation/scene/SceneFlow").SceneLoadingPresenter;
type SceneTransitionProgress = import("../../src/framework/presentation/scene/SceneFlow").SceneTransitionProgress;
type SceneResourceRequest = import("../../src/framework/presentation/scene/BaseGameScene").SceneResourceRequest;
type ScenePhaseContext<T> = import("../../src/framework/presentation/scene/BaseGameScene").ScenePhaseContext<T>;

interface TestArgs {
    readonly resources?: readonly string[];
    readonly completeLoadingDuringReady?: boolean;
}

class TestScene extends BaseGameScene<TestArgs> {
    readonly events: string[] = [];
    pauseGate: Promise<void> | undefined;

    constructor(readonly label: string) {
        super();
        this.own(() => {
            this.events.push("owned-cleanup");
            transitionTimeline.push(`${this.label}:destroy`);
        });
    }

    finishLoading(): void {
        this.completeTransitionLoading();
    }

    protected override describeResources(args: TestArgs): readonly SceneResourceRequest[] {
        this.events.push("describe-resources");
        return (args.resources ?? []).map((url) => ({ url }));
    }

    protected override onPrepare(context: ScenePhaseContext<TestArgs>): void {
        this.events.push("prepare");
        context.reportProgress(0.5);
    }

    protected override onWaitUntilReady(context: ScenePhaseContext<TestArgs>): void {
        this.events.push("wait-ready");
        context.reportProgress(0.5);
        if (context.args.completeLoadingDuringReady) this.completeTransitionLoading();
    }

    protected override async onTransitionPause(): Promise<void> {
        this.events.push("pause");
        await this.pauseGate;
    }

    protected override onTransitionResume(): void {
        this.events.push("resume");
    }

    protected override onTransitionLeaving(): void {
        this.events.push("leaving");
        transitionTimeline.push(`${this.label}:leaving`);
    }
}

class FakeLoadingPresenter implements SceneLoadingPresenter {
    readonly shown: SceneTransitionProgress[] = [];
    readonly updated: SceneTransitionProgress[] = [];
    readonly failures: Array<{ readonly progress: SceneTransitionProgress; readonly error: unknown }> = [];
    readonly events: string[] = [];
    hides = 0;

    show(progress: SceneTransitionProgress): void {
        this.shown.push(progress);
        this.events.push("show");
        transitionTimeline.push("loading:show");
    }

    update(progress: SceneTransitionProgress): void {
        this.updated.push(progress);
        this.events.push(`update:${progress.phase}:${progress.overall}`);
    }

    fail(progress: SceneTransitionProgress, error: unknown): void {
        this.failures.push({ progress, error });
        this.events.push("fail");
    }

    hide(): void {
        this.hides += 1;
        this.events.push("hide");
    }
}

beforeEach(() => {
    factories.clear();
    load.mockClear();
    sceneGc.mockClear();
    transitionTimeline.length = 0;
    slowSceneResolve = undefined;
    failedResourceUrl = undefined;
});

afterAll(() => vi.unstubAllGlobals());

describe("SceneFlow", () => {
    it("keeps the scene signal through reversible pause but aborts before leave and direct destruction", async () => {
        let abortedBeforeLeave = false;
        class LeavingScene extends TestScene {
            protected override onTransitionLeaving(): void { abortedBeforeLeave = this.signal.aborted; }
        }
        const scene = new LeavingScene("lifetime");
        await scene.pauseForTransition({ nextRouteId: "next" });
        await scene.resumeAfterTransitionFailure();
        expect(scene.signal.aborted).toBe(false);
        await scene.leaveForTransition();
        expect(abortedBeforeLeave).toBe(true);
        const direct = new TestScene("direct");
        const cancelled = vi.fn(); direct.signal.addEventListener("abort", cancelled);
        direct.destroy(); direct.destroy();
        expect(cancelled).toHaveBeenCalledOnce();
    });

    it("collects the old scene before loading the new hierarchy and resources", async () => {
        const presenter = new FakeLoadingPresenter();
        const flow = new SceneFlow({ loadingPresenter: presenter, waitForFrame: async () => {} });
        const routeA = flow.register<TestArgs>({ id: "a", url: "a.ls" });
        const routeB = flow.register<TestArgs>({ id: "b", url: "b.ls" });
        let sceneA!: TestScene;
        let sceneB!: TestScene;
        factories.set("a.ls", () => (sceneA = new TestScene("a")));
        factories.set("b.ls", () => (sceneB = new TestScene("b")));

        await flow.open(routeA, {}, { showLoading: false });
        const progress: SceneTransitionProgress[] = [];
        await flow.open(routeB, { resources: ["hero.lh", "arena.png", "hero.lh"] }, {
            onProgress: (value) => progress.push(value),
        });

        expect(flow.current).toBe(sceneB);
        expect(sceneA.destroyed).toBe(true);
        expect(sceneA.events).toEqual(["describe-resources", "prepare", "wait-ready", "pause", "leaving", "owned-cleanup"]);
        expect(sceneB.events).toEqual(["describe-resources", "prepare", "wait-ready"]);
        expect(load).toHaveBeenCalledWith(
            [expect.objectContaining({ url: "hero.lh" }), expect.objectContaining({ url: "arena.png" })],
            undefined,
            expect.any(Function),
        );
        expect(sceneGc).toHaveBeenCalledOnce();
        expect(transitionTimeline.indexOf("loading:show"))
            .toBeLessThan(transitionTimeline.indexOf("a:leaving"));
        expect(transitionTimeline.indexOf("a:destroy"))
            .toBeLessThan(transitionTimeline.indexOf("gc"));
        expect(transitionTimeline.indexOf("gc"))
            .toBeLessThan(transitionTimeline.indexOf("load:b.ls"));
        expect(progress[progress.length - 1]).toMatchObject({
            phase: "ready", overall: 1, scene: 1, resources: 1,
        });
        expect(progress.every((value, index) => index === 0 || value.overall >= progress[index - 1].overall)).toBe(true);
        expect(presenter.shown).toHaveLength(1);
        expect(presenter.hides).toBe(1);
        expect(presenter.events.slice(-2)).toEqual(["update:ready:1", "hide"]);
    });

    it("keeps loading visible in a failed state when loading fails after the old scene is released", async () => {
        const presenter = new FakeLoadingPresenter();
        const flow = new SceneFlow({ loadingPresenter: presenter, waitForFrame: async () => {} });
        const routeA = flow.register<TestArgs>({ id: "a", url: "a.ls" });
        const routeB = flow.register<TestArgs>({ id: "b", url: "b.ls" });
        let sceneA!: TestScene;
        let sceneB!: TestScene;
        factories.set("a.ls", () => (sceneA = new TestScene("a")));
        factories.set("b.ls", () => (sceneB = new TestScene("b")));
        await flow.open(routeA, {}, { showLoading: false });
        failedResourceUrl = "missing.png";

        await expect(flow.open(routeB, { resources: ["missing.png"] }))
            .rejects.toThrow("Scene resources failed to load: missing.png");

        expect(flow.current).toBeUndefined();
        expect(sceneA.destroyed).toBe(true);
        expect(sceneA.events).toContain("pause");
        expect(sceneA.events).toContain("leaving");
        expect(sceneB.destroyed).toBe(true);
        expect(sceneGc).toHaveBeenCalledOnce();
        expect(presenter.failures).toHaveLength(1);
        expect(presenter.hides).toBe(0);
    });

    it("rejects a late scene result after a newer route wins without hiding the newer loading session", async () => {
        const presenter = new FakeLoadingPresenter();
        const flow = new SceneFlow({ loadingPresenter: presenter, waitForFrame: async () => {} });
        const routeA = flow.register<TestArgs>({ id: "a", url: "a.ls" });
        const slowRoute = flow.register<TestArgs>({ id: "slow", url: "slow.ls" });
        const fastRoute = flow.register<TestArgs>({ id: "fast", url: "fast.ls" });
        let sceneA!: TestScene;
        let fastScene!: TestScene;
        factories.set("a.ls", () => (sceneA = new TestScene("a")));
        factories.set("fast.ls", () => (fastScene = new TestScene("fast")));
        await flow.open(routeA, {}, { showLoading: false });

        const slow = flow.open(slowRoute, {});
        await vi.waitFor(() => expect(slowSceneResolve).toBeTypeOf("function"));
        const fast = flow.open(fastRoute, {});
        await fast;
        slowSceneResolve?.(new FakePrefab(() => new TestScene("slow")));

        await expect(slow).rejects.toBeInstanceOf(SceneTransitionCancelledError);
        expect(flow.current).toBe(fastScene);
        expect(sceneA.destroyed).toBe(true);
        expect(presenter.shown).toHaveLength(2);
        expect(presenter.hides).toBe(1);
    });

    it("keeps loading visible when the caller aborts after the old scene is released", async () => {
        const presenter = new FakeLoadingPresenter();
        const flow = new SceneFlow({ loadingPresenter: presenter, waitForFrame: async () => {} });
        const routeA = flow.register<TestArgs>({ id: "a", url: "a.ls" });
        const slowRoute = flow.register<TestArgs>({ id: "slow", url: "slow.ls" });
        let sceneA!: TestScene;
        factories.set("a.ls", () => (sceneA = new TestScene("a")));
        await flow.open(routeA, {}, { showLoading: false });
        const controller = new AbortController();

        const transition = flow.open(slowRoute, {}, { signal: controller.signal });
        await vi.waitFor(() => expect(slowSceneResolve).toBeTypeOf("function"));
        controller.abort();
        slowSceneResolve?.(new FakePrefab(() => new TestScene("slow")));

        await expect(transition).rejects.toBeInstanceOf(SceneTransitionCancelledError);
        expect(flow.current).toBeUndefined();
        expect(sceneA.destroyed).toBe(true);
        expect(sceneA.events).toContain("pause");
        expect(sceneA.events).toContain("leaving");
        expect(presenter.failures).toHaveLength(1);
        expect(presenter.hides).toBe(0);
    });

    it("resumes the old scene when cancellation happens before destructive release", async () => {
        const presenter = new FakeLoadingPresenter();
        const flow = new SceneFlow({ loadingPresenter: presenter, waitForFrame: async () => {} });
        const routeA = flow.register<TestArgs>({ id: "a", url: "a.ls" });
        const routeB = flow.register<TestArgs>({ id: "b", url: "b.ls" });
        let sceneA!: TestScene;
        let releasePause!: () => void;
        factories.set("a.ls", () => (sceneA = new TestScene("a")));
        factories.set("b.ls", () => new TestScene("b"));
        await flow.open(routeA, {}, { showLoading: false });
        sceneA.pauseGate = new Promise<void>((resolve) => { releasePause = resolve; });
        const controller = new AbortController();

        const transition = flow.open(routeB, {}, { signal: controller.signal });
        await vi.waitFor(() => expect(sceneA.events).toContain("pause"));
        controller.abort();
        releasePause();

        await expect(transition).rejects.toBeInstanceOf(SceneTransitionCancelledError);
        expect(flow.current).toBe(sceneA);
        expect(sceneA.destroyed).toBe(false);
        expect(sceneA.events).toContain("resume");
        expect(transitionTimeline).not.toContain("load:b.ls");
        expect(sceneGc).not.toHaveBeenCalled();
        expect(presenter.failures).toHaveLength(0);
        expect(presenter.hides).toBe(1);
    });

    it("lets a scene complete a manual loading session after it is ready", async () => {
        const presenter = new FakeLoadingPresenter();
        const flow = new SceneFlow({ loadingPresenter: presenter, waitForFrame: async () => {} });
        const route = flow.register<TestArgs>({ id: "manual", url: "manual.ls" });
        let scene!: TestScene;
        factories.set("manual.ls", () => (scene = new TestScene("manual")));

        await flow.open(route, {}, { autoCloseLoading: false });

        expect(presenter.hides).toBe(0);
        scene.finishLoading();
        expect(presenter.hides).toBe(1);
        scene.finishLoading();
        expect(presenter.hides).toBe(1);
    });

    it("defers a scene-requested close until ready reaches 100 percent", async () => {
        const presenter = new FakeLoadingPresenter();
        const flow = new SceneFlow({ loadingPresenter: presenter, waitForFrame: async () => {} });
        const route = flow.register<TestArgs>({ id: "manual", url: "manual.ls" });
        factories.set("manual.ls", () => new TestScene("manual"));

        await flow.open(route, { completeLoadingDuringReady: true }, { autoCloseLoading: false });

        expect(presenter.events.slice(-2)).toEqual(["update:ready:1", "hide"]);
    });

    it("ignores a stale scene loading completion after a newer transition owns loading", async () => {
        const presenter = new FakeLoadingPresenter();
        const flow = new SceneFlow({ loadingPresenter: presenter, waitForFrame: async () => {} });
        const routeA = flow.register<TestArgs>({ id: "a", url: "a.ls" });
        const routeB = flow.register<TestArgs>({ id: "b", url: "b.ls" });
        let sceneA!: TestScene;
        let sceneB!: TestScene;
        factories.set("a.ls", () => (sceneA = new TestScene("a")));
        factories.set("b.ls", () => (sceneB = new TestScene("b")));
        await flow.open(routeA, {}, { autoCloseLoading: false });
        await flow.open(routeB, {}, { autoCloseLoading: false });

        sceneA.finishLoading();
        expect(presenter.hides).toBe(0);
        sceneB.finishLoading();
        expect(presenter.hides).toBe(1);
    });

    it("runs the full transition without presenting loading UI when showLoading is false", async () => {
        const presenter = new FakeLoadingPresenter();
        const flow = new SceneFlow({ loadingPresenter: presenter, waitForFrame: async () => {} });
        const route = flow.register<TestArgs>({ id: "silent", url: "silent.ls" });
        factories.set("silent.ls", () => new TestScene("silent"));
        const progress: SceneTransitionProgress[] = [];

        await flow.open(route, {}, { showLoading: false, onProgress: (value) => progress.push(value) });

        expect(presenter.shown).toHaveLength(0);
        expect(presenter.updated).toHaveLength(0);
        expect(presenter.hides).toBe(0);
        expect(progress[progress.length - 1]?.overall).toBe(1);
    });
});

type SceneUIContext = import("../../src/framework/presentation/ui/SceneUI").SceneUI;

class UIAwareScene extends TestScene {
    preparedUI: SceneUIContext | undefined;
    protected override onPrepare(context: ScenePhaseContext<TestArgs>): void {
        this.preparedUI = this.ui;
        super.onPrepare(context);
    }
}

function fakeSceneUI() {
    return { dispose: vi.fn(), waitForPendingLoads: vi.fn(async () => {}) };
}

function uiGate() {
    let resolve!: () => void;
    const promise = new Promise<void>(complete => { resolve = complete; });
    return { promise, resolve };
}

describe("SceneFlow UI ownership", () => {
    it("configures UI before preparation and disposes it before native Scene destruction", async () => {
        const ui = fakeSceneUI();
        const createUI = vi.fn(() => ui as unknown as SceneUIContext);
        const flow = new SceneFlow({ waitForFrame: async () => {}, configureScene: scene => scene.configureUI(createUI) });
        const route = flow.register<TestArgs>({ id: "ui", url: "ui.ls" });
        let scene!: UIAwareScene;
        factories.set("ui.ls", () => (scene = new UIAwareScene("ui")));
        await flow.open(route, {}, { showLoading: false });
        expect(scene.preparedUI).toBe(ui);
        expect(createUI).toHaveBeenCalledOnce();
        const nativeDestroy = vi.spyOn(FakeScene.prototype, "destroy").mockImplementation(function (this: FakeScene) {
            expect(ui.dispose).toHaveBeenCalledOnce();
            this.destroyed = true;
            this.parent = null;
        });
        flow.dispose();
        expect(nativeDestroy).toHaveBeenCalledOnce();
        expect(scene.destroyed).toBe(true);
        expect(() => scene.ui).toThrow("no longer available");
        flow.dispose();
        expect(ui.dispose).toHaveBeenCalledOnce();
    });

    it("allocates no UI context for scenes that never request one", async () => {
        const createUI = vi.fn(() => fakeSceneUI() as unknown as SceneUIContext);
        const flow = new SceneFlow({ waitForFrame: async () => {}, configureScene: scene => scene.configureUI(createUI) });
        const route = flow.register<TestArgs>({ id: "world", url: "world.ls" });
        factories.set("world.ls", () => new TestScene("world"));
        await flow.open(route, {}, { showLoading: false });
        flow.dispose();
        expect(createUI).not.toHaveBeenCalled();
    });

    it("waits for cancelled UI native loads before GC and loading the next scene", async () => {
        const pending = uiGate();
        const ui = fakeSceneUI();
        ui.dispose.mockImplementation(() => transitionTimeline.push("ui:dispose"));
        ui.waitForPendingLoads.mockImplementation(async () => {
            transitionTimeline.push("ui:wait");
            await pending.promise;
            transitionTimeline.push("ui:settled");
        });
        const flow = new SceneFlow({ waitForFrame: async () => {}, configureScene: scene => {
            scene.configureUI(() => ui as unknown as SceneUIContext);
        } });
        const a = flow.register<TestArgs>({ id: "a", url: "a.ls" });
        const b = flow.register<TestArgs>({ id: "b", url: "b.ls" });
        let sceneA!: UIAwareScene;
        factories.set("a.ls", () => (sceneA = new UIAwareScene("a")));
        factories.set("b.ls", () => new TestScene("b"));
        await flow.open(a, {}, { showLoading: false });
        transitionTimeline.length = 0;
        const switching = flow.open(b, {}, { showLoading: false });
        await vi.waitFor(() => expect(ui.waitForPendingLoads).toHaveBeenCalledOnce());
        expect(sceneA.destroyed).toBe(true);
        expect(sceneGc).not.toHaveBeenCalled();
        expect(transitionTimeline).not.toContain("load:b.ls");
        pending.resolve();
        await switching;
        expect(transitionTimeline.indexOf("ui:dispose")).toBeLessThan(transitionTimeline.indexOf("a:destroy"));
        expect(transitionTimeline.indexOf("ui:settled")).toBeLessThan(transitionTimeline.indexOf("gc"));
        expect(transitionTimeline.indexOf("gc")).toBeLessThan(transitionTimeline.indexOf("load:b.ls"));
        flow.dispose();
    });

    it("stops resource collection when scene-owned UI cleanup fails", async () => {
        const ui = fakeSceneUI();
        ui.dispose.mockImplementation(() => { throw new Error("UI cleanup failed"); });
        const flow = new SceneFlow({ waitForFrame: async () => {}, configureScene: scene => {
            scene.configureUI(() => ui as unknown as SceneUIContext);
        } });
        const a = flow.register<TestArgs>({ id: "a", url: "a.ls" });
        const b = flow.register<TestArgs>({ id: "b", url: "b.ls" });
        let sceneA!: UIAwareScene;
        factories.set("a.ls", () => (sceneA = new UIAwareScene("a")));
        factories.set("b.ls", () => new TestScene("b"));
        await flow.open(a, {}, { showLoading: false });
        await expect(flow.open(b, {}, { showLoading: false })).rejects.toThrow("cleanup");
        expect(sceneA.destroyed).toBe(true);
        expect(sceneGc).not.toHaveBeenCalled();
        expect(transitionTimeline).not.toContain("load:b.ls");
        expect(() => flow.dispose()).toThrow("cleanup");
    });

    it("allows the leaving hook to access an existing UI context without allocating a new one", async () => {
        const ui = fakeSceneUI();
        let leavingUI: SceneUIContext | undefined;
        class LeavingScene extends UIAwareScene {
            protected override onTransitionLeaving(): void { leavingUI = this.ui; }
        }
        const createUI = vi.fn(() => ui as unknown as SceneUIContext);
        const flow = new SceneFlow({ waitForFrame: async () => {}, configureScene: scene => scene.configureUI(createUI) });
        const a = flow.register<TestArgs>({ id: "a", url: "a.ls" });
        const b = flow.register<TestArgs>({ id: "b", url: "b.ls" });
        factories.set("a.ls", () => new LeavingScene("a"));
        factories.set("b.ls", () => new TestScene("b"));
        await flow.open(a, {}, { showLoading: false });
        await flow.open(b, {}, { showLoading: false });
        expect(leavingUI).toBe(ui);
        expect(createUI).toHaveBeenCalledOnce();
        flow.dispose();
    });

    it("does not run transition GC after runtime disposal while UI loads are settling", async () => {
        const pending = uiGate();
        const ui = fakeSceneUI();
        ui.waitForPendingLoads.mockImplementation(() => pending.promise);
        const flow = new SceneFlow({ waitForFrame: async () => {}, configureScene: scene => {
            scene.configureUI(() => ui as unknown as SceneUIContext);
        } });
        const a = flow.register<TestArgs>({ id: "a", url: "a.ls" });
        const b = flow.register<TestArgs>({ id: "b", url: "b.ls" });
        factories.set("a.ls", () => new UIAwareScene("a"));
        factories.set("b.ls", () => new TestScene("b"));
        await flow.open(a, {}, { showLoading: false });
        const switching = flow.open(b, {}, { showLoading: false });
        const rejection = expect(switching).rejects.toBeInstanceOf(SceneTransitionCancelledError);
        await vi.waitFor(() => expect(ui.waitForPendingLoads).toHaveBeenCalledOnce());
        flow.dispose();
        pending.resolve();
        await rejection;
        expect(sceneGc).not.toHaveBeenCalled();
        expect(transitionTimeline).not.toContain("load:b.ls");
    });

    it("reports late scene cleanup failures through draining after runtime disposal", async () => {
        const leaving = uiGate();
        const release = uiGate();
        class BrokenScene extends TestScene {
            constructor() {
                super("broken");
                this.own(() => { throw new Error("late scene owner cleanup failed"); });
            }
            protected override async onTransitionLeaving(): Promise<void> {
                leaving.resolve();
                await release.promise;
            }
        }
        const flow = new SceneFlow({ waitForFrame: async () => {} });
        const source = flow.register<TestArgs>({ id: "source", url: "source.ls" });
        const target = flow.register<TestArgs>({ id: "target", url: "target.ls" });
        factories.set("source.ls", () => new BrokenScene());
        factories.set("target.ls", () => new TestScene("target"));
        await flow.open(source, {}, { showLoading: false });
        const switching = flow.open(target, {}, { showLoading: false }).catch(error => error);
        await leaving.promise;
        flow.dispose();
        const drain = flow.waitForPendingLoads().then(() => undefined, error => error);
        release.resolve();
        await switching;
        expect(await drain).toBeInstanceOf(Error);
        expect(sceneGc).not.toHaveBeenCalled();
        expect(transitionTimeline).not.toContain("load:target.ls");
    });
});
