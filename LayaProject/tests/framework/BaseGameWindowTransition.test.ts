import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BindingToken } from "../../src/framework/application/ui/AsyncBindingGuard";
import type { BaseGameWindow as BaseGameWindowType } from "../../src/framework/presentation/ui/BaseGameWindow";

class FakeWidget {
    destroyed = false;
    x = 0;
    y = 0;
    width = 500;
    height = 300;
    scaleX = 1;
    scaleY = 1;
    // Native GWindow starts in auto mode, whose public boolean getter returns false.
    mouseEnabled = false;

    destroy(): void {
        this.destroyed = true;
    }
}

class FakeGWindow extends FakeWidget {
    contentPane!: FakeWidget;
    parent: object | undefined;

    get isShowing(): boolean { return this.parent !== undefined; }

    show(): void {
        if (this.isShowing) return;
        this.parent = root;
        (this as unknown as { doShowAnimation(): void }).doShowAnimation();
    }

    hide(): void {
        if (this.isShowing) (this as unknown as { doHideAnimation(): void }).doHideAnimation();
    }

    hideImmediately(): void {
        if (!this.isShowing) return;
        this.parent = undefined;
        (this as unknown as { onHide(): void }).onHide();
    }

    bringToFront(): void {}

    protected onShown(): void {}
    protected onHide(): void {}
    protected doShowAnimation(): void { this.onShown(); }
    protected doHideAnimation(): void { this.hideImmediately(); }

    override destroy(): void {
        if (this.destroyed) return;
        if (this.isShowing) this.hideImmediately();
        this.contentPane?.destroy();
        super.destroy();
    }
}

class FakeTween {
    readonly values = new Map<string, number>();
    callback: (() => void) | undefined;
    killed = false;
    durationMs = 0;

    constructor(readonly target: Record<string, number>) {}

    duration(value: number): this {
        this.durationMs = value;
        return this;
    }

    to(property: string, value: number): this {
        this.values.set(property, value);
        return this;
    }

    ease(): this { return this; }

    then(callback: () => void): this {
        this.callback = callback;
        return this;
    }

    kill(): void { this.killed = true; }

    complete(): void {
        if (this.killed) return;
        for (const [property, value] of this.values) this.target[property] = value;
        this.callback?.();
    }

    fireLateCallback(): void { this.callback?.(); }
}

const root = {};
const tweens: FakeTween[] = [];
vi.stubGlobal("Laya", {
    GWidget: FakeWidget,
    GWindow: FakeGWindow,
    Ease: { backOut: () => {}, sineIn: () => {} },
    Tween: {
        create(target: Record<string, number>): FakeTween {
            const tween = new FakeTween(target);
            tweens.push(tween);
            return tween;
        },
    },
});

const { BaseGameWindow } = await import("../../src/framework/presentation/ui/BaseGameWindow") as {
    BaseGameWindow: typeof BaseGameWindowType;
};

class TestWindow extends BaseGameWindow<string> {
    shownCount = 0;

    constructor(contentPane: Laya.GWidget) {
        super(contentPane);
    }

    protected onBind(_args: string, _token: BindingToken): void {}
    protected override onShown(): void { this.shownCount += 1; }
}

beforeEach(() => {
    tweens.length = 0;
});

afterAll(() => vi.unstubAllGlobals());

describe("BaseGameWindow popup transition", () => {
    it("preserves an explicit input disable across the popup animation", async () => {
        const window = new TestWindow(new FakeWidget() as unknown as Laya.GWidget);
        window.mouseEnabled = false;
        window.configurePopupTransition(true);
        await window.present("args");
        tweens[0].complete();
        expect(window.mouseEnabled).toBe(false);
        window.hide();
        tweens[1].complete();
        expect(window.mouseEnabled).toBe(false);
    });

    it("keeps fullscreen windows on the native immediate lifecycle", async () => {
        const window = new TestWindow(new FakeWidget() as unknown as Laya.GWidget);

        await window.present("args");
        expect(window.shownCount).toBe(1);
        expect(tweens).toHaveLength(0);

        window.hide();
        expect(window.isShowing).toBe(false);
    });

    it("scales popup content from its visual center and restores authored state", async () => {
        const pane = new FakeWidget();
        pane.x = 12;
        pane.y = 18;
        const window = new TestWindow(pane as unknown as Laya.GWidget);
        window.configurePopupTransition(true);

        await window.present("args");

        expect(window.mouseEnabled).toBe(false);
        expect(pane).toMatchObject({ x: 187, y: 123, scaleX: 0.3, scaleY: 0.3 });
        expect(tweens[0].durationMs).toBe(200);
        tweens[0].complete();
        expect(window.shownCount).toBe(1);
        expect(window.mouseEnabled).toBe(true);
        expect(pane).toMatchObject({ x: 12, y: 18, scaleX: 1, scaleY: 1 });

        window.hide();
        expect(window.isPopupHiding).toBe(true);
        expect(window.isShowing).toBe(true);
        tweens[1].complete();
        expect(window.isShowing).toBe(false);
        expect(pane).toMatchObject({ x: 12, y: 18, scaleX: 1, scaleY: 1 });
    });

    it("cancels show animation when closed and ignores every late or repeated callback", async () => {
        const pane = new FakeWidget();
        const window = new TestWindow(pane as unknown as Laya.GWidget);
        window.configurePopupTransition(true);
        await window.present("args");
        const showTween = tweens[0];
        pane.x = 100;
        pane.y = 60;
        pane.scaleX = 0.6;
        pane.scaleY = 0.6;

        window.hide();
        const hideTween = tweens[1];
        expect(showTween.killed).toBe(true);
        expect(window.mouseEnabled).toBe(false);
        window.hide();
        expect(tweens).toHaveLength(2);

        showTween.fireLateCallback();
        expect(window.shownCount).toBe(0);
        expect(window.isShowing).toBe(true);
        hideTween.complete();
        expect(window.isShowing).toBe(false);
        expect(window.mouseEnabled).toBe(true);
        expect(pane).toMatchObject({ x: 0, y: 0, scaleX: 1, scaleY: 1 });

        hideTween.fireLateCallback();
        expect(window.isShowing).toBe(false);
    });

    it("kills an unfinished transition before destruction", async () => {
        const pane = new FakeWidget();
        const window = new TestWindow(pane as unknown as Laya.GWidget);
        window.configurePopupTransition(true);
        await window.present("args");
        const tween = tweens[0];

        window.destroy();
        tween.fireLateCallback();

        expect(tween.killed).toBe(true);
        expect(window.destroyed).toBe(true);
        expect(pane.destroyed).toBe(true);
        expect(window.shownCount).toBe(0);
    });

    it("destroys a transient popup directly after its hide transition", async () => {
        const pane = new FakeWidget();
        const window = new TestWindow(pane as unknown as Laya.GWidget);
        window.configurePopupTransition(true);
        window.configureDestroyWhenHidden(true);
        await window.present("args");
        tweens[0].complete();

        window.hide();
        tweens[1].complete();

        expect(window.destroyed).toBe(true);
        expect(pane.destroyed).toBe(true);
        expect(window.isShowing).toBe(false);
    });
});
