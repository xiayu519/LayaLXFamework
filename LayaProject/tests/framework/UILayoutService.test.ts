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
        const fullBleed = pane.addNamedChild("fullBleed", sized(new FakeWidget(), 750, 1334));
        const safeContent = pane.addNamedChild("safeContent", sized(new FakeWidget(), 750, 1334));
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
        const fullBleed = pane.addNamedChild("fullBleed", sized(new FakeWidget(), 750, 1334));
        const safeContent = pane.addNamedChild("safeContent", sized(new FakeWidget(), 750, 1334));
        const top = safeContent.addNamedChild("top", sized(new FakeWidget(), 750, 100));
        const middle = safeContent.addNamedChild("middle", sized(new FakeWidget(), 604, 370));
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
        const middle = safeContent.addNamedChild("middle", sized(new FakeWidget(), 604, 370));
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
        const pane = sized(new FakeWidget(), 600, 400);
        const window = new FakeWindow(pane);
        const snapshots: number[] = [];
        layout.subscribe((value) => snapshots.push(value.viewport.width));
        layout.start();
        layout.apply(window as unknown as Laya.GWindow, "center-popup");

        expect(window).toMatchObject({ x: 200, y: 700, width: 600, height: 400 });
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
