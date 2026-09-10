const TRANSITION_SCALE = 0.3;
const TRANSITION_DURATION_MS = 200;

type TransitionPhase = "idle" | "showing" | "hiding";

interface TransformSnapshot {
    readonly x: number;
    readonly y: number;
    readonly scaleX: number;
    readonly scaleY: number;
}

/** Animates the authored safeContent/mid while its owner retains show/close/destruction semantics. */
export class UIPopupTransition {
    private phaseValue: TransitionPhase = "idle";
    private version = 0;
    private tween: Laya.Tween | undefined;
    private baseline: TransformSnapshot | undefined;
    private inputBeforeTransition: boolean | undefined;
    private completed: (() => void) | undefined;

    constructor(private readonly view: Laya.GWidget, private readonly pane: Laya.GWidget = view) {}

    get phase(): TransitionPhase { return this.phaseValue; }

    show(completed?: () => void): void {
        this.cancel();
        if (this.view.destroyed) return;
        const mid = this.mid;
        const baseline = captureTransform(mid);
        this.baseline = baseline;
        this.phaseValue = "showing";
        this.completed = completed;
        this.blockInput();
        applyTransform(mid, centeredScale(baseline, mid));
        const version = ++this.version;
        this.tween = Laya.Tween.create(mid, this.view)
            .duration(TRANSITION_DURATION_MS)
            .to("x", baseline.x)
            .to("y", baseline.y)
            .to("scaleX", baseline.scaleX)
            .to("scaleY", baseline.scaleY)
            .ease(Laya.Ease.backOut)
            .then(() => this.complete(version, "showing"));
    }

    hide(completed: () => void): void {
        if (this.view.destroyed || this.phaseValue === "hiding") return;
        if (this.phaseValue === "showing") {
            this.killTween();
        } else {
            this.cancel();
            this.baseline = captureTransform(this.mid);
            this.blockInput();
        }
        const baseline = this.baseline ?? captureTransform(this.mid);
        this.baseline = baseline;
        this.phaseValue = "hiding";
        this.completed = completed;
        const target = centeredScale(baseline, this.mid);
        const version = ++this.version;
        this.tween = Laya.Tween.create(this.mid, this.view)
            .duration(TRANSITION_DURATION_MS)
            .to("x", target.x)
            .to("y", target.y)
            .to("scaleX", target.scaleX)
            .to("scaleY", target.scaleY)
            .ease(Laya.Ease.sineIn)
            .then(() => this.complete(version, "hiding"));
    }

    cancel(): void {
        this.killTween();
        this.restoreTransform();
        this.baseline = undefined;
        this.phaseValue = "idle";
        this.completed = undefined;
        this.restoreInput();
    }

    /** New layout becomes the authored baseline; old callbacks can no longer close or restore it. */
    relayout(apply: () => void): void {
        const phase = this.phaseValue;
        const completed = this.completed;
        this.cancel();
        const version = this.version;
        apply();
        if (this.view.destroyed || version !== this.version) return;
        if (phase === "showing") this.show(completed);
        else if (phase === "hiding") this.hide(completed!);
    }

    private get mid(): Laya.GWidget {
        const mid = this.pane.getChildByName("safeContent")?.getChildByName("mid");
        if (!(mid instanceof Laya.GWidget)) throw new Error("Popup animation requires safeContent/mid.");
        return mid;
    }

    private complete(version: number, phase: TransitionPhase): void {
        if (version !== this.version || phase !== this.phaseValue) return;
        this.tween = undefined;
        this.restoreTransform();
        this.baseline = undefined;
        this.phaseValue = "idle";
        this.restoreInput();
        const completed = this.completed;
        this.completed = undefined;
        if (!this.view.destroyed) completed?.();
    }

    private killTween(): void {
        this.version++;
        this.tween?.kill(false);
        this.tween = undefined;
    }

    private restoreTransform(): void {
        if (!this.baseline || this.pane.destroyed) return;
        const mid = this.mid;
        if (!mid.destroyed) applyTransform(mid, this.baseline);
    }

    private blockInput(): void {
        if (this.inputBeforeTransition === undefined) this.inputBeforeTransition = this.view.mouseEnabled;
        this.view.mouseEnabled = false;
    }

    private restoreInput(): void {
        if (this.inputBeforeTransition === undefined) return;
        if (!this.view.destroyed) this.view.mouseEnabled = this.inputBeforeTransition;
        this.inputBeforeTransition = undefined;
    }
}

function captureTransform(widget: Laya.GWidget): TransformSnapshot {
    return { x: widget.x, y: widget.y, scaleX: widget.scaleX, scaleY: widget.scaleY };
}

function centeredScale(baseline: TransformSnapshot, widget: Laya.GWidget): TransformSnapshot {
    const scaleX = baseline.scaleX * TRANSITION_SCALE;
    const scaleY = baseline.scaleY * TRANSITION_SCALE;
    return {
        x: baseline.x + widget.width * (baseline.scaleX - scaleX) / 2,
        y: baseline.y + widget.height * (baseline.scaleY - scaleY) / 2,
        scaleX, scaleY,
    };
}

function applyTransform(widget: Laya.GWidget, value: TransformSnapshot): void {
    widget.x = value.x;
    widget.y = value.y;
    widget.scaleX = value.scaleX;
    widget.scaleY = value.scaleY;
}
