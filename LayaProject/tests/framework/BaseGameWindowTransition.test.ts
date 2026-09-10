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

    readonly children = new Map<string, FakeWidget>();
    getChildByName(name: string): FakeWidget | undefined { return this.children.get(name); }

    destroy(): void {
        for (const child of this.children.values()) child.destroy();
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
const { UIPopupTransition } = await import("../../src/framework/presentation/ui/UIPopupTransition");

class TestWindow extends BaseGameWindow<string> {
    shownCount = 0;
    closedCount = 0;
    closedAction = (): void => {};

    constructor(contentPane: Laya.GWidget) {
        const rootPane = new FakeWidget();
        rootPane.width = 720; rootPane.height = 1280;
        const safe = new FakeWidget();
        safe.children.set("mid", contentPane as unknown as FakeWidget);
        rootPane.children.set("safeContent", safe);
        super(rootPane as unknown as Laya.GWidget);
    }

    protected onBind(_args: string, _token: BindingToken): void {}
    protected override onShown(): void { this.shownCount += 1; }
    protected override onClosed(): void { this.closedCount++; this.closedAction(); }
}

beforeEach(() => {
    tweens.length = 0;
});

afterAll(() => vi.unstubAllGlobals());

describe("BaseGameWindow popup transition", () => {
    it("notifies once after hide, again after reopen, and survives a throwing business hook", async () => {
        const mid = new FakeWidget();
        const window = new TestWindow(mid as unknown as Laya.GWidget);
        window.configurePopupTransition(true);
        await window.present("first"); tweens[0].complete();
        window.hide(); window.hide();
        expect(window.closedCount).toBe(0);
        tweens[1].complete(); tweens[1].fireLateCallback();
        expect(window.closedCount).toBe(0); // Native UNDISPLAY bookkeeping has not returned yet.
        await Promise.resolve();
        expect(window.closedCount).toBe(1);
        await window.present("second"); tweens[2].complete();
        window.closedAction = () => { throw new Error("business hook failed"); };
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            expect(() => window.destroy()).not.toThrow();
            await Promise.resolve();
            expect(window.closedCount).toBe(2);
            expect(window.destroyed && mid.destroyed).toBe(true);
            expect(error).toHaveBeenCalledOnce();
            window.destroy();
            expect(window.closedCount).toBe(2);
        } finally { error.mockRestore(); }
    });

    it("does not call onClosed for an instance that was never displayed", async () => {
        const window = new TestWindow(new FakeWidget() as unknown as Laya.GWidget);
        window.destroy();
        await Promise.resolve();
        expect(window.closedCount).toBe(0);
    });
    it.each(["showing", "hiding"])("reflows mid during %s without restoring stale animation coordinates", async (phase) => {
        const mid = new FakeWidget();
        const window = new TestWindow(mid as unknown as Laya.GWidget);
        window.configurePopupTransition(true);
        await window.present("args");
        if (phase === "hiding") { tweens[0].complete(); window.hide(); }
        const stale = tweens[tweens.length - 1];
        window.updateLayout(() => {
            mid.x = 30; mid.y = 50; mid.scaleX = mid.scaleY = 0.8;
            window.contentPane.height = 900;
        });
        stale.fireLateCallback();
        expect(stale.killed).toBe(true);
        expect(window.mouseEnabled).toBe(false);
        tweens[tweens.length - 1].complete();
        expect(mid).toMatchObject({ x: 30, y: 50, scaleX: 0.8, scaleY: 0.8 });
        expect(window.contentPane).toMatchObject({ x: 0, y: 0, width: 720, height: 900, scaleX: 1, scaleY: 1 });
        expect(window.isShowing).toBe(phase === "showing");
        window.destroy();
    });
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
        expect(window.contentPane).toMatchObject({ x: 0, y: 0, width: 720, height: 1280, scaleX: 1, scaleY: 1 });
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

function createPageTransition() {
    const view = new FakeWidget();
    view.width = 720; view.height = 1280; view.mouseEnabled = true;
    const safe = new FakeWidget();
    const mid = new FakeWidget();
    safe.children.set("mid", mid);
    view.children.set("safeContent", safe);
    return { view, safe, mid, transition: new UIPopupTransition(view as unknown as Laya.GWidget) };
}

describe("UIPopupTransition native page reuse", () => {
    it("animates only safeContent/mid and cancels a pending close when shown again", () => {
        const { view, safe, mid, transition } = createPageTransition();
        const firstShown = vi.fn();
        const closed = vi.fn();
        const reopened = vi.fn();
        transition.show(firstShown);
        expect(transition.phase).toBe("showing");
        expect(mid).toMatchObject({ x: 175, y: 105, scaleX: 0.3, scaleY: 0.3 });
        expect(view).toMatchObject({ x: 0, y: 0, width: 720, height: 1280, scaleX: 1, scaleY: 1, mouseEnabled: false });
        expect(safe).toMatchObject({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
        transition.hide(closed);
        const closing = tweens[1];
        expect(tweens[0].killed).toBe(true);
        transition.show(reopened);
        expect(closing.killed).toBe(true);
        closing.fireLateCallback(); tweens[0].fireLateCallback();
        expect(closed).not.toHaveBeenCalled();
        expect(firstShown).not.toHaveBeenCalled();
        expect(transition.phase).toBe("showing");
        expect(tweens[2].durationMs).toBe(200);
        tweens[2].complete(); tweens[2].fireLateCallback();
        expect(reopened).toHaveBeenCalledOnce();
        expect(transition.phase).toBe("idle");
        expect(view.mouseEnabled).toBe(true);
        expect(mid).toMatchObject({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
    });

    it.each(["showing", "hiding"] as const)("retains the completion callback after relayout during %s", phase => {
        const { view, mid, transition } = createPageTransition();
        const completed = vi.fn();
        if (phase === "showing") transition.show(completed);
        else transition.hide(completed);
        const stale = tweens[0];
        transition.relayout(() => {
            mid.x = 12; mid.y = 18; mid.scaleX = 0.8; mid.scaleY = 0.9;
            view.height = 900;
        });
        expect(stale.killed).toBe(true);
        stale.fireLateCallback();
        expect(completed).not.toHaveBeenCalled();
        expect(transition.phase).toBe(phase);
        expect(view.mouseEnabled).toBe(false);
        expect(tweens[1].durationMs).toBe(200);
        tweens[1].complete();
        expect(completed).toHaveBeenCalledOnce();
        expect(mid).toMatchObject({ x: 12, y: 18, scaleX: 0.8, scaleY: 0.9 });
        expect(view).toMatchObject({ height: 900, scaleX: 1, scaleY: 1, mouseEnabled: true });
    });

    it("cancels without calling completion and retains an explicitly disabled input state", () => {
        const { view, mid, transition } = createPageTransition();
        view.mouseEnabled = false;
        const completed = vi.fn();
        transition.hide(completed);
        transition.hide(vi.fn());
        expect(tweens).toHaveLength(1);
        transition.cancel(); transition.cancel();
        tweens[0].fireLateCallback();
        expect(completed).not.toHaveBeenCalled();
        expect(transition.phase).toBe("idle");
        expect(mid).toMatchObject({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
        expect(view.mouseEnabled).toBe(false);
    });

    it("honors cancellation or destruction triggered by relayout instead of restarting stale animation", () => {
        const { transition } = createPageTransition();
        const completed = vi.fn();
        transition.show(completed);
        transition.relayout(() => transition.cancel());
        expect(tweens).toHaveLength(1);
        expect(transition.phase).toBe("idle");
        tweens[0].fireLateCallback();
        expect(completed).not.toHaveBeenCalled();

        const next = createPageTransition();
        next.transition.hide(completed);
        next.transition.relayout(() => next.view.destroy());
        expect(tweens).toHaveLength(2);
        expect(next.transition.phase).toBe("idle");
        tweens[1].fireLateCallback();
        expect(completed).not.toHaveBeenCalled();
    });
});
