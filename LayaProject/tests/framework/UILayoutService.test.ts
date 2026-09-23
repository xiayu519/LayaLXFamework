import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlatformService } from "../../src/framework/platform/PlatformService";

class FakeWidget {
    width = 0;
    height = 0;
    x = 0;
    y = 0;
    scaleX = 1;
    scaleY = 1;
    private readonly children = new Map<string, FakeWidget>();

    addNamedChild(name: string, child: FakeWidget): FakeWidget {
        this.children.set(name, child);
        return child;
    }

    getChildByName(name: string): FakeWidget | null {
        return this.children.get(name) ?? null;
    }
}

class FakeWindow extends FakeWidget {
    constructor(readonly contentPane: FakeWidget) {
        super();
    }
}

class FakeStage extends FakeWidget {
    private listener: (() => void) | undefined;

    on(_event: string, _caller: unknown, listener: () => void): void {
        this.listener = listener;
    }

    off(_event: string, _caller: unknown, listener: () => void): void {
        if (this.listener === listener) this.listener = undefined;
    }

    resize(width: number, height: number): void {
        this.width = width;
        this.height = height;
        root.width = width;
        root.height = height;
        this.listener?.();
    }
}

const root = new FakeWidget();
const stage = new FakeStage();

afterEach(() => vi.unstubAllGlobals());

describe("UILayoutService", () => {
    it("rolls back a subscription when its initial callback fails", async () => {
        root.width = stage.width = 720;
        root.height = stage.height = 1280;
        vi.stubGlobal("Laya", { GWidget: FakeWidget, GRoot: { inst: root }, stage });
        const { UILayoutService } = await import("../../src/framework/presentation/ui/UILayoutService");
        const layout = new UILayoutService(createPlatform({ width: 720, height: 1280 }));
        layout.refresh();
        const failure = new Error("Initial layout failed.");
        const failed = vi.fn(() => { throw failure; });
        expect(() => layout.subscribe(failed)).toThrow(failure);
        const active = vi.fn();
        const unsubscribe = layout.subscribe(active);
        root.width = stage.width = 640;
        expect(() => layout.refresh()).not.toThrow();
        expect(failed).toHaveBeenCalledTimes(1);
        expect(active).toHaveBeenCalledTimes(2);
        unsubscribe();
        root.width = stage.width = 600;
        layout.refresh();
        expect(active).toHaveBeenCalledTimes(2);
    });

    it("preserves an earlier subscription if subscribing the same callback again fails", async () => {
        root.width = stage.width = 720;
        root.height = stage.height = 1280;
        vi.stubGlobal("Laya", { GWidget: FakeWidget, GRoot: { inst: root }, stage });
        const { UILayoutService } = await import("../../src/framework/presentation/ui/UILayoutService");
        const layout = new UILayoutService(createPlatform({ width: 720, height: 1280 }));
        layout.refresh();
        const listener = vi.fn();
        const unsubscribe = layout.subscribe(listener);
        listener.mockImplementationOnce(() => { throw new Error("Repeated subscription failed."); });
        expect(() => layout.subscribe(listener)).toThrow("Repeated subscription failed.");
        root.width = stage.width = 640;
        layout.refresh();
        expect(listener).toHaveBeenCalledTimes(3);
        unsubscribe();
        root.width = stage.width = 600;
        layout.refresh();
        expect(listener).toHaveBeenCalledTimes(3);
    });

    it("clips safe areas and capsule avoidance into a local host rectangle", async () => {
        root.width = stage.width = 720; root.height = stage.height = 1280;
        vi.stubGlobal("Laya", { GWidget: FakeWidget, GRoot: { inst: root }, stage });
        const { UILayoutService } = await import("../../src/framework/presentation/ui/UILayoutService");
        const layout = new UILayoutService(createPlatform({ width: 720, height: 1280,
            safeArea: { x: 20, y: 40, width: 680, height: 1200 },
            topRightAvoidance: { x: 600, y: 48, width: 100, height: 32 } }));
        layout.refresh();
        const local = layout.snapshotForHost({ x: 10, y: 60, width: 600, height: 1200 });
        expect(local.viewport).toEqual({ x: 0, y: 0, width: 600, height: 1200 });
        expect(local.safeArea).toEqual({ x: 10, y: 0, width: 590, height: 1180 });
        expect(local.topSafeArea).toEqual({ x: 10, y: 28, width: 590, height: 1152 });
    });
    it("moves only top for fullscreen safe-area adaptation", async () => {
        root.width = stage.width = 720; root.height = stage.height = 1280;
        vi.stubGlobal("Laya", { GWidget: FakeWidget, GRoot: { inst: root }, stage, Event: { RESIZE: "resize" } });
        const viewport = { width: 720, height: 1280,
            safeArea: { x: 20, y: 40, width: 680, height: 1200 },
            topRightAvoidance: { x: 600, y: 48, width: 100, height: 32 },
        };
        const { UILayoutService } = await import("../../src/framework/presentation/ui/UILayoutService");
        const layout = new UILayoutService(createPlatform(viewport));
        const pane = sized(new FakeWidget(), 720, 1280);
        const background = pane.addNamedChild("full", sized(new FakeWidget(), 720, 1280));
        const safe = pane.addNamedChild("safeContent", sized(new FakeWidget(), 720, 1280));
        const top = safe.addNamedChild("top", sized(new FakeWidget(), 720, 184));
        const full = safe.addNamedChild("full", sized(new FakeWidget(), 680, 888));
        const mid = safe.addNamedChild("mid", sized(new FakeWidget(), 560, 390));
        const bottom = safe.addNamedChild("bottom", sized(new FakeWidget(), 720, 208));
        Object.assign(full, { x: 20, y: 184 });
        Object.assign(mid, { x: 80, y: 445 });
        Object.assign(bottom, { x: 0, y: 1072 });
        const window = new FakeWindow(pane);
        const checkFixedSlots = (): void => {
            expect(full).toMatchObject({ x: 20, y: 184, width: 680, height: 888, scaleX: 1, scaleY: 1 });
            expect(mid).toMatchObject({ x: 80, y: 445, width: 560, height: 390, scaleX: 1, scaleY: 1 });
            expect(bottom).toMatchObject({ x: 0, y: 1072, width: 720, height: 208, scaleX: 1, scaleY: 1 });
        };

        layout.apply(window as unknown as Laya.GWindow, "fullscreen");
        expect(safe).toMatchObject({ x: 0, y: 0, width: 720, height: 1280 });
        expect(top).toMatchObject({ x: 20, y: 88, width: 680, height: 184 });
        expect(background).toMatchObject({ x: 0, y: 0, width: 720, height: 1280 });
        checkFixedSlots();

        viewport.topRightAvoidance.y += 32;
        layout.apply(window as unknown as Laya.GWindow, "fullscreen");
        expect(top.y).toBe(120);
        checkFixedSlots();

        root.height = stage.height = viewport.height = 960;
        viewport.safeArea.height = 880;
        layout.apply(window as unknown as Laya.GWindow, "fullscreen");
        expect(safe).toMatchObject({ x: 0, y: 0, width: 720, height: 960 });
        expect(background).toMatchObject({ x: 0, y: 0, width: 720, height: 960 });
        checkFixedSlots();
    });
    it("does not offset top when the platform reports no safe-area geometry", async () => {
        root.width = stage.width = 640; root.height = stage.height = 480;
        vi.stubGlobal("Laya", { GWidget: FakeWidget, GRoot: { inst: root }, stage });
        const { UILayoutService } = await import("../../src/framework/presentation/ui/UILayoutService");
        const layout = new UILayoutService(createPlatform({ width: 640, height: 480 }));
        const pane = sized(new FakeWidget(), 640, 480);
        const safe = pane.addNamedChild("safeContent", sized(new FakeWidget(), 640, 480));
        const top = safe.addNamedChild("top", sized(new FakeWidget(), 640, 64));
        const full = safe.addNamedChild("full", sized(new FakeWidget(), 640, 340));
        Object.assign(full, { x: 0, y: 47 });

        layout.apply(new FakeWindow(pane) as unknown as Laya.GWindow, "fullscreen");

        expect(top).toMatchObject({ x: 0, y: 0, width: 640, height: 64 });
        expect(full).toMatchObject({ x: 0, y: 47, width: 640, height: 340 });
    });
    it("requires popup mid, fits all its contents uniformly and restores the design size", async () => {
        root.width = stage.width = 400; root.height = stage.height = 600;
        vi.stubGlobal("Laya", { GWidget: FakeWidget, GRoot: { inst: root }, stage });
        const { UILayoutService } = await import("../../src/framework/presentation/ui/UILayoutService");
        const layout = new UILayoutService(createPlatform({ width: 400, height: 600 }));
        const pane = sized(new FakeWidget(), 720, 1280);
        const window = new FakeWindow(pane);
        expect(() => layout.apply(window as unknown as Laya.GWindow, "center-popup")).toThrow(/mid/);
        const safe = pane.addNamedChild("safeContent", sized(new FakeWidget(), 720, 1280));
        const mid = safe.addNamedChild("mid", sized(new FakeWidget(), 560, 390));
        const full = pane.addNamedChild("full", sized(new FakeWidget(), 720, 1280));
        layout.apply(window as unknown as Laya.GWindow, "center-popup");
        expect(pane).toMatchObject({ x: 0, y: 0, width: 400, height: 600, scaleX: 1, scaleY: 1 });
        expect(full).toMatchObject({ width: 400, height: 600, scaleX: 1, scaleY: 1 });
        expect(mid).toMatchObject({ width: 560, height: 390, x: 0 });
        expect(mid.scaleX).toBeCloseTo(400 / 560);
        expect(mid.scaleY).toBe(mid.scaleX);
        root.width = stage.width = 720; root.height = stage.height = 1280;
        layout.apply(window as unknown as Laya.GWindow, "center-popup");
        expect(mid).toMatchObject({ x: 80, y: 445, width: 560, height: 390, scaleX: 1, scaleY: 1 });
    });
    it("fits a full-screen prefab to a project-selected 720 by 1280 stage", async () => {
        root.width = stage.width = 720;
        root.height = stage.height = 1280;
        vi.stubGlobal("Laya", {
            GWidget: FakeWidget,
            GRoot: { inst: root },
            stage,
            Event: { RESIZE: "resize" },
        });
        const platform = createPlatform({ width: 720, height: 1280 });
        const { UILayoutService } = await import("../../src/framework/presentation/ui/UILayoutService");
        const layout = new UILayoutService(platform);
        const pane = sized(new FakeWidget(), 750, 1334);
        const fullBleed = pane.addNamedChild("full", sized(new FakeWidget(), 750, 1334));
        const safeContent = pane.addNamedChild("safeContent", sized(new FakeWidget(), 720, 1280));
        const window = new FakeWindow(pane);

        layout.apply(window as unknown as Laya.GWindow, "fullscreen");

        expect(window).toMatchObject({ x: 0, y: 0, width: 720, height: 1280 });
        expect(pane).toMatchObject({ x: 0, y: 0, width: 720, height: 1280 });
        expect(fullBleed).toMatchObject({ x: 0, y: 0, width: 720, height: 1280 });
        expect(safeContent).toMatchObject({ x: 0, y: 0, width: 720, height: 1280 });
    });

    it("uses the live GRoot size and applies the safe area only to top", async () => {
        root.width = stage.width = 750;
        root.height = stage.height = 1624;
        vi.stubGlobal("Laya", {
            GWidget: FakeWidget,
            GRoot: { inst: root },
            stage,
            Event: { RESIZE: "resize" },
        });
        const platform = createPlatform({
            width: 375,
            height: 812,
            safeArea: { x: 0, y: 44, width: 375, height: 734 },
            topRightAvoidance: { x: 280, y: 48, width: 87, height: 32 },
        });
        const { UILayoutService } = await import("../../src/framework/presentation/ui/UILayoutService");
        const layout = new UILayoutService(platform);
        const pane = sized(new FakeWidget(), 750, 1334);
        const fullBleed = pane.addNamedChild("full", sized(new FakeWidget(), 750, 1334));
        const safeContent = pane.addNamedChild("safeContent", sized(new FakeWidget(), 720, 1280));
        const top = safeContent.addNamedChild("top", sized(new FakeWidget(), 750, 100));
        const middle = safeContent.addNamedChild("mid", sized(new FakeWidget(), 604, 370));
        const bottom = safeContent.addNamedChild("bottom", sized(new FakeWidget(), 750, 120));
        const window = new FakeWindow(pane);

        layout.start();
        layout.apply(window as unknown as Laya.GWindow, "fullscreen");

        expect(window).toMatchObject({ x: 0, y: 0, width: 750, height: 1624 });
        expect(pane).toMatchObject({ x: 0, y: 0, width: 750, height: 1624 });
        expect(fullBleed).toMatchObject({ x: 0, y: 0, width: 750, height: 1624 });
        expect(safeContent).toMatchObject({ x: 0, y: 0, width: 750, height: 1624 });
        expect(top).toMatchObject({ x: 0, y: 168, width: 750, height: 100 });
        expect(middle).toMatchObject({ x: 0, y: 0, width: 604, height: 370, scaleX: 1, scaleY: 1 });
        expect(bottom).toMatchObject({ x: 0, y: 0, width: 750, height: 120 });
        expect(layout.snapshot().topSafeArea.y).toBe(168);
    });

    it("preserves authored middle coordinates across fullscreen resizes", async () => {
        root.width = stage.width = 540;
        root.height = stage.height = 960;
        vi.stubGlobal("Laya", {
            GWidget: FakeWidget,
            GRoot: { inst: root },
            stage,
            Event: { RESIZE: "resize" },
        });
        const platform = createPlatform({ width: 540, height: 960 });
        const { UILayoutService } = await import("../../src/framework/presentation/ui/UILayoutService");
        const layout = new UILayoutService(platform);
        const pane = sized(new FakeWidget(), 720, 1280);
        const safeContent = pane.addNamedChild("safeContent", sized(new FakeWidget(), 720, 1280));
        const middle = safeContent.addNamedChild("mid", sized(new FakeWidget(), 604, 370));
        Object.assign(middle, { x: 58, y: 455 });
        const window = new FakeWindow(pane);

        layout.apply(window as unknown as Laya.GWindow, "fullscreen");

        expect(middle).toMatchObject({ width: 604, height: 370, x: 58, y: 455, scaleX: 1, scaleY: 1 });

        root.width = stage.width = 720;
        root.height = stage.height = 1280;
        layout.apply(window as unknown as Laya.GWindow, "fullscreen");
        expect(middle).toMatchObject({ width: 604, height: 370, x: 58, y: 455, scaleX: 1, scaleY: 1 });
    });

    it("reflows from a stage resize and centers popups inside the safe area", async () => {
        root.width = stage.width = 1000;
        root.height = stage.height = 1800;
        vi.stubGlobal("Laya", {
            GWidget: FakeWidget,
            GRoot: { inst: root },
            stage,
            Event: { RESIZE: "resize" },
        });
        const platform = createPlatform({
            width: 500,
            height: 900,
            safeArea: { x: 10, y: 50, width: 480, height: 800 },
        });
        const { UILayoutService } = await import("../../src/framework/presentation/ui/UILayoutService");
        const layout = new UILayoutService(platform);
        const pane = sized(new FakeWidget(), 720, 1280);
        const safe = pane.addNamedChild("safeContent", sized(new FakeWidget(), 720, 1280));
        const mid = safe.addNamedChild("mid", sized(new FakeWidget(), 600, 400));
        const window = new FakeWindow(pane);
        const snapshots: number[] = [];
        layout.subscribe((value) => snapshots.push(value.viewport.width));
        layout.start();
        layout.apply(window as unknown as Laya.GWindow, "center-popup");

        expect(window).toMatchObject({ x: 0, y: 0, width: 1000, height: 1800 });
        expect(mid).toMatchObject({ x: 200, y: 700, width: 600, height: 400 });
        stage.resize(800, 1600);
        expect(layout.snapshot().viewport).toMatchObject({ width: 800, height: 1600 });
        expect(layout.snapshot().safeArea.x).toBe(16);
        expect(layout.snapshot().safeArea.y).toBeCloseTo(88.889);
        expect(layout.snapshot().safeArea.width).toBe(768);
        expect(layout.snapshot().safeArea.height).toBeCloseTo(1422.222);
        layout.apply(window as unknown as Laya.GWindow, "center-popup");
        expect(mid).toMatchObject({ x: 100, y: 600, width: 600, height: 400 });
        expect(snapshots).toEqual([1000, 800]);
        layout.stop();
        stage.resize(700, 1400);
        expect(layout.snapshot().viewport.width).toBe(800);
    });
});

function createPlatform(viewport: PlatformService["viewport"]): PlatformService {
    return {
        name: "platform:test",
        kind: "native",
        viewport,
        start() {},
        stop() {},
        nowMs: () => 0,
        openExternalUrl() {},
    };
}

function sized<TWidget extends FakeWidget>(widget: TWidget, width: number, height: number): TWidget {
    widget.width = width;
    widget.height = height;
    return widget;
}
