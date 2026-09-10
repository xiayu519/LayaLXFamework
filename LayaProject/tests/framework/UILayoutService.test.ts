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
    it.each(["fullscreen", "center-popup"] as const)("adapts all retained empty slots for %s", async mode => {
        root.width = stage.width = 720; root.height = stage.height = 1280;
        vi.stubGlobal("Laya", { GWidget: FakeWidget, GRoot: { inst: root }, stage });
        const { UILayoutService } = await import("../../src/framework/presentation/ui/UILayoutService");
        const layout = new UILayoutService(createPlatform({ width: 720, height: 1280,
            safeArea: { x: 20, y: 40, width: 680, height: 1200 },
            topRightAvoidance: { x: 600, y: 48, width: 100, height: 32 },
        }));
        const pane = sized(new FakeWidget(), 720, 1280);
        const background = pane.addNamedChild("full", sized(new FakeWidget(), 720, 1280));
        const safe = pane.addNamedChild("safeContent", sized(new FakeWidget(), 720, 1280));
        const top = safe.addNamedChild("top", sized(new FakeWidget(), 720, 0));
        const full = safe.addNamedChild("full", sized(new FakeWidget(), 720, 1280));
        const mid = safe.addNamedChild("mid", sized(new FakeWidget(), 560, 390));
        const bottom = safe.addNamedChild("bottom", sized(new FakeWidget(), 720, 0));
        const window = new FakeWindow(pane);
        layout.apply(window as unknown as Laya.GWindow, mode);
        expect(top).toMatchObject({ y: 48, height: 0, width: 680 });
        expect(bottom).toMatchObject({ y: 1200, height: 0, width: 680 });
        expect(full).toMatchObject({ x: 0, y: 48, width: 680, height: 1152, scaleX: 1, scaleY: 1 });
        expect(mid).toMatchObject({ width: 560, height: 390, x: 60, scaleX: 1 });
        expect(mid.y).toBe(mode === "fullscreen" ? 405 : 429);
        root.width = stage.width = 540; root.height = stage.height = 960;
        layout.apply(window as unknown as Laya.GWindow, mode);
        expect(background).toMatchObject({ width: 540, height: 960 });
        expect(top.height).toBe(0); expect(bottom.height).toBe(0);
        expect(full).toMatchObject({ y: 38, width: 510, height: 862, scaleX: 1 });
    });
    it("stretches safeContent/full between moving top and bottom without scaling list content", async () => {
        root.width = stage.width = 720; root.height = stage.height = 1280;
        vi.stubGlobal("Laya", { GWidget: FakeWidget, GRoot: { inst: root }, stage, Event: { RESIZE: "resize" } });
        const viewport = {
            width: 720, height: 1280,
            safeArea: { x: 20, y: 40, width: 680, height: 1200 },
            topRightAvoidance: { x: 580, y: 48, width: 120, height: 32 },
        };
        const { UILayoutService } = await import("../../src/framework/presentation/ui/UILayoutService");
        const layout = new UILayoutService(createPlatform(viewport));
        const pane = sized(new FakeWidget(), 720, 1280);
        const background = pane.addNamedChild("full", sized(new FakeWidget(), 720, 1280));
        const safe = pane.addNamedChild("safeContent", sized(new FakeWidget(), 720, 1280));
        const top = safe.addNamedChild("top", sized(new FakeWidget(), 720, 184));
        const full = safe.addNamedChild("full", sized(new FakeWidget(), 720, 888));
        const bottom = safe.addNamedChild("bottom", sized(new FakeWidget(), 720, 208));
        const window = new FakeWindow(pane);
        const check = () => {
            layout.apply(window as unknown as Laya.GWindow, "fullscreen");
            expect(full).toMatchObject({ x: 0, y: top.y + top.height, width: safe.width, scaleX: 1, scaleY: 1 });
            expect(full.y + full.height).toBeCloseTo(bottom.y);
            expect(background).toMatchObject({ x: 0, y: 0, width: stage.width, height: stage.height });
            return full.height;
        };
        const initial = check();
        viewport.topRightAvoidance.y += 32;
        expect(check()).toBeCloseTo(initial - 32);
        root.height = stage.height = viewport.height = 960;
        viewport.safeArea.height = 880;
        expect(check()).toBeCloseTo(initial - 352);
        root.height = stage.height = viewport.height = 1280;
        viewport.safeArea.height = 1200;
        viewport.topRightAvoidance.y -= 32;
        expect(check()).toBeCloseTo(initial);
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

    it("uses the live GRoot size and applies safe top, middle, and bottom slots", async () => {
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
        expect(safeContent).toMatchObject({ x: 0, y: 88, width: 750, height: 1468 });
        expect(top).toMatchObject({ x: 0, y: 80, width: 750, height: 100 });
        expect(middle).toMatchObject({ x: 73, y: 549, width: 604, height: 370 });
        expect(bottom).toMatchObject({ x: 0, y: 1348, width: 750, height: 120 });
        expect(layout.snapshot().topSafeArea.y).toBe(168);
    });

    it("uniformly scales middle content to fit a narrow safe area", async () => {
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
        const window = new FakeWindow(pane);

        layout.apply(window as unknown as Laya.GWindow, "fullscreen");

        const expectedScale = 540 / 604;
        expect(middle).toMatchObject({ width: 604, height: 370, x: 0 });
        expect(middle.scaleX).toBeCloseTo(expectedScale);
        expect(middle.scaleY).toBeCloseTo(expectedScale);
        expect(middle.y).toBeCloseTo((960 - 370 * expectedScale) / 2);

        root.width = stage.width = 720;
        root.height = stage.height = 1280;
        layout.apply(window as unknown as Laya.GWindow, "fullscreen");
        expect(middle).toMatchObject({ width: 604, height: 370, x: 58, y: 455, scaleX: 1, scaleY: 1 });
    });

    it("keeps a centered middle clear of top and bottom slots across short screens and capsule changes", async () => {
        root.width = stage.width = 720;
        root.height = stage.height = 960;
        vi.stubGlobal("Laya", {
            GWidget: FakeWidget, GRoot: { inst: root }, stage, Event: { RESIZE: "resize" },
        });
        const viewport = {
            width: 720, height: 960,
            safeArea: { x: 0, y: 40, width: 720, height: 880 },
            topRightAvoidance: { x: 540, y: 48, width: 160, height: 64 },
        };
        const { UILayoutService } = await import("../../src/framework/presentation/ui/UILayoutService");
        const layout = new UILayoutService(createPlatform(viewport));
        const pane = sized(new FakeWidget(), 720, 1280);
        const safe = pane.addNamedChild("safeContent", sized(new FakeWidget(), 720, 1280));
        const top = safe.addNamedChild("top", sized(new FakeWidget(), 720, 184));
        const middle = safe.addNamedChild("mid", sized(new FakeWidget(), 640, 680));
        const bottom = safe.addNamedChild("bottom", sized(new FakeWidget(), 720, 208));
        const window = new FakeWindow(pane);
        const check = (): void => {
            layout.apply(window as unknown as Laya.GWindow, "fullscreen");
            expect(middle.y).toBeGreaterThanOrEqual(top.y + top.height - 0.001);
            expect(middle.y + middle.height * middle.scaleY).toBeLessThanOrEqual(bottom.y + 0.001);
            expect(middle.y + middle.height * middle.scaleY / 2).toBeCloseTo(layout.snapshot().safeArea.height / 2);
            expect(middle.x + middle.width * middle.scaleX / 2).toBeCloseTo(safe.width / 2);
            expect(middle.scaleX).toBe(middle.scaleY);
            expect(middle.scaleX).toBeGreaterThan(0);
            expect(top.height).toBe(184);
            expect(bottom.y + bottom.height).toBe(layout.snapshot().safeArea.height);
        };

        check();
        expect(middle.scaleY).toBeLessThan(1);
        viewport.topRightAvoidance.y = 88;
        check();
        root.height = stage.height = viewport.height = 1600;
        viewport.safeArea.height = 1520;
        check();
        expect(middle.scaleY).toBe(1);
        expect(middle).toMatchObject({ width: 640, height: 680 });
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
        expect(mid).toMatchObject({ x: 180, y: 600, width: 600, height: 400 });
        stage.resize(800, 1600);
        expect(layout.snapshot().viewport).toMatchObject({ width: 800, height: 1600 });
        expect(layout.snapshot().safeArea.x).toBe(16);
        expect(layout.snapshot().safeArea.y).toBeCloseTo(88.889);
        expect(layout.snapshot().safeArea.width).toBe(768);
        expect(layout.snapshot().safeArea.height).toBeCloseTo(1422.222);
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
