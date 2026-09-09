import {
    LifetimeCleanupError,
    LifetimeScope,
} from "../../application/lifecycle/LifetimeScope";
import { AsyncBindingGuard, awaitBinding, type BindingToken } from "../../application/ui/AsyncBindingGuard";

const POPUP_TRANSITION_SCALE = 0.3;
const POPUP_TRANSITION_DURATION_MS = 200;

type WindowTransitionPhase = "idle" | "showing" | "hiding";

interface WindowTransformSnapshot {
    readonly x: number;
    readonly y: number;
    readonly scaleX: number;
    readonly scaleY: number;
}

export interface WindowLifecycleObserver {
    onHidden(window: BaseGameWindow<unknown>): void;
    onDestroyed(window: BaseGameWindow<unknown>): void;
    onOrderChanged?(window: BaseGameWindow<unknown>): void;
}

export abstract class BaseGameWindow<TArgs> extends Laya.GWindow {
    private readonly bindingGuard = new AsyncBindingGuard();
    private readonly lifetimeScope = new LifetimeScope();
    private presentationScopeValue: LifetimeScope | undefined;
    private lifecycleObserver: WindowLifecycleObserver | undefined;
    private destroying = false;
    private destructionCompleteValue = false;
    private destructionFailureValue: LifetimeCleanupError | undefined;
    private popupTransitionEnabled = false;
    private transitionPhase: WindowTransitionPhase = "idle";
    private transitionVersion = 0;
    private transitionTween: Laya.Tween | undefined;
    private transitionBaseline: WindowTransformSnapshot | undefined;
    private mouseEnabledBeforeTransition: boolean | undefined;
    private destroyWhenHidden = false;

    protected constructor(contentPane: Laya.GWidget) {
        super();
        // Native auto input reads as false; restoring that boolean after a Tween disables the subtree.
        // GWindow already listens for mouse input. Make its enabled state explicit before transitions.
        this.mouseEnabled = true;
        this.contentPane = contentPane;
    }

    protected get lifetime(): LifetimeScope {
        return this.lifetimeScope;
    }

    protected get presentation(): LifetimeScope {
        if (!this.presentationScopeValue) {
            throw new Error("The window has no active presentation lifetime.");
        }
        return this.presentationScopeValue;
    }

    get destructionComplete(): boolean { return this.destructionCompleteValue; }

    /** Native destroyed may become true before cleanup throws; it does not prove completion. */
    get destructionFailure(): LifetimeCleanupError | undefined { return this.destructionFailureValue; }

    /** @internal Configured by UIRouter from the resolved window layout. */
    configurePopupTransition(enabled: boolean): void {
        if (this.popupTransitionEnabled === enabled) return;
        this.cancelPopupTransition();
        this.popupTransitionEnabled = enabled;
    }

    /** @internal Allows UIRouter to route destroy-retained popups through their hide animation. */
    get hasPopupTransition(): boolean { return this.popupTransitionEnabled; }

    /** @internal Configured by UIRouter so native close buttons honor route retention. */
    configureDestroyWhenHidden(enabled: boolean): void {
        this.destroyWhenHidden = enabled;
    }

    /** @internal Allows UIRouter to resolve a show request racing an unfinished hide animation. */
    get isPopupHiding(): boolean { return this.transitionPhase === "hiding"; }

    /** @internal Completes a retained popup hide before presenting the same instance again. */
    finishPopupHideImmediately(): void {
        if (!this.isPopupHiding) return;
        const errors: unknown[] = [];
        collectCleanup(errors, () => this.cancelPopupTransition());
        collectCleanup(errors, () => {
            if (this.isShowing) this.hideImmediately();
        });
        if (errors.length > 0) throw new LifetimeCleanupError(errors);
    }

    async present(args: TArgs, signal?: AbortSignal): Promise<boolean> {
        this.endPresentation();
        const scope = new LifetimeScope();
        this.presentationScopeValue = scope;
        const token = this.bindingGuard.next(signal);
        try {
            if (token.isCurrent()) await awaitBinding(this.onBind(args, token), token.signal);
        } catch (error) {
            const cancelled = token.signal.aborted;
            this.endPresentation(scope);
            if (cancelled) return false;
            throw error;
        }
        if (!token.isCurrent()) {
            this.endPresentation(scope);
            return false;
        }
        this.show();
        return true;
    }

    hideForReuse(): void {
        this.hide();
    }

    override hide(): void {
        const errors: unknown[] = [];
        collectCleanup(errors, () => this.endPresentation());
        collectCleanup(errors, () => super.hide());
        if (errors.length > 0) throw new LifetimeCleanupError(errors);
    }

    override bringToFront(): void {
        super.bringToFront();
        this.lifecycleObserver?.onOrderChanged?.(this as unknown as BaseGameWindow<unknown>);
    }

    protected override doShowAnimation(): void {
        if (!this.popupTransitionEnabled) {
            super.doShowAnimation();
            return;
        }

        this.cancelPopupTransition();
        const pane = this.contentPane;
        const baseline = captureTransform(pane);
        this.transitionBaseline = baseline;
        this.transitionPhase = "showing";
        this.blockTransitionInput();
        applyCenteredScale(pane, baseline, POPUP_TRANSITION_SCALE);
        const version = ++this.transitionVersion;
        this.transitionTween = Laya.Tween.create(pane, this)
            .duration(POPUP_TRANSITION_DURATION_MS)
            .to("x", baseline.x)
            .to("y", baseline.y)
            .to("scaleX", baseline.scaleX)
            .to("scaleY", baseline.scaleY)
            .ease(Laya.Ease.backOut)
            .then(() => this.finishShowTransition(version));
    }

    protected override doHideAnimation(): void {
        if (!this.popupTransitionEnabled) {
            if (this.destroyWhenHidden) this.destroy();
            else super.doHideAnimation();
            return;
        }
        if (this.transitionPhase === "hiding") return;

        if (this.transitionPhase === "showing") {
            this.killTransitionTween();
        } else {
            this.cancelPopupTransition();
            this.transitionBaseline = captureTransform(this.contentPane);
            this.blockTransitionInput();
        }
        const baseline = this.transitionBaseline ?? captureTransform(this.contentPane);
        this.transitionBaseline = baseline;
        this.transitionPhase = "hiding";
        const target = centeredScale(baseline, this.contentPane, POPUP_TRANSITION_SCALE);
        const version = ++this.transitionVersion;
        this.transitionTween = Laya.Tween.create(this.contentPane, this)
            .duration(POPUP_TRANSITION_DURATION_MS)
            .to("x", target.x)
            .to("y", target.y)
            .to("scaleX", target.scaleX)
            .to("scaleY", target.scaleY)
            .ease(Laya.Ease.sineIn)
            .then(() => this.finishHideTransition(version));
    }

    /** @internal Used by UIRouter to observe native GWindow hide/destroy lifecycle. */
    observeLifecycle(observer: WindowLifecycleObserver): void {
        if (this.lifecycleObserver && this.lifecycleObserver !== observer) {
            throw new Error("Window lifecycle observer is already assigned.");
        }
        this.lifecycleObserver = observer;
    }

    override destroy(): void {
        if (this.destroying) return;
        if (this.destructionFailureValue) throw this.destructionFailureValue;
        if (this.destroyed) return;
        this.destroying = true;
        const observer = this.lifecycleObserver;
        this.lifecycleObserver = undefined;
        const errors: unknown[] = [];
        try {
            collectCleanup(errors, () => this.cancelPopupTransition());
            this.bindingGuard.dispose();
            collectCleanup(errors, () => this.disposePresentation());
            collectCleanup(errors, () => this.lifetimeScope.dispose());
            const permanentErrors = [...errors];
            let nativeCompleted = false;
            try {
                super.destroy();
                if (!this.destroyed) throw new Error("GWindow.destroy() returned without destroying the window.");
                nativeCompleted = true;
            } catch (error) {
                errors.push(error);
                if (this.destroyed) permanentErrors.push(error);
            }
            if (permanentErrors.length > 0) {
                this.destructionFailureValue = new LifetimeCleanupError(permanentErrors);
            }
            if (nativeCompleted && !this.destructionFailureValue) {
                this.destructionCompleteValue = true;
                collectCleanup(errors, () => observer?.onDestroyed(
                    this as unknown as BaseGameWindow<unknown>,
                ));
            } else {
                this.lifecycleObserver = observer;
            }
            if (errors.length > 0) {
                throw new LifetimeCleanupError(errors);
            }
        } finally {
            this.destroying = false;
        }
    }

    protected override onHide(): void {
        const errors: unknown[] = [];
        collectCleanup(errors, () => this.cancelPopupTransition());
        this.bindingGuard.invalidate();
        collectCleanup(errors, () => this.disposePresentation());
        collectCleanup(errors, () => super.onHide());
        collectCleanup(errors, () => this.lifecycleObserver?.onHidden(
            this as unknown as BaseGameWindow<unknown>,
        ));
        if (errors.length > 0) {
            throw new LifetimeCleanupError(errors);
        }
    }

    protected requireChild<TNode extends Laya.Node>(name: string, type: new (...args: any[]) => TNode): TNode {
        return this.contentPane.findChild(name, type);
    }

    protected abstract onBind(args: TArgs, token: BindingToken): void | Promise<void>;

    private finishShowTransition(version: number): void {
        if (!this.isCurrentTransition(version, "showing")) return;
        this.completePopupTransition();
        if (!this.destroyed && this.isShowing) this.onShown();
    }

    private finishHideTransition(version: number): void {
        if (!this.isCurrentTransition(version, "hiding")) return;
        this.completePopupTransition();
        if (this.destroyed || !this.isShowing) return;
        if (this.destroyWhenHidden) this.destroy();
        else this.hideImmediately();
    }

    private isCurrentTransition(version: number, phase: WindowTransitionPhase): boolean {
        return version === this.transitionVersion && this.transitionPhase === phase;
    }

    private completePopupTransition(): void {
        this.transitionTween = undefined;
        this.restoreTransitionTransform();
        this.transitionBaseline = undefined;
        this.transitionPhase = "idle";
        this.restoreTransitionInput();
    }

    private cancelPopupTransition(): void {
        this.killTransitionTween();
        this.restoreTransitionTransform();
        this.transitionBaseline = undefined;
        this.transitionPhase = "idle";
        this.restoreTransitionInput();
    }

    private killTransitionTween(): void {
        this.transitionVersion += 1;
        this.transitionTween?.kill(false);
        this.transitionTween = undefined;
    }

    private restoreTransitionTransform(): void {
        const baseline = this.transitionBaseline;
        if (!baseline || this.contentPane.destroyed) return;
        applyTransform(this.contentPane, baseline);
    }

    private blockTransitionInput(): void {
        if (this.mouseEnabledBeforeTransition === undefined) {
            this.mouseEnabledBeforeTransition = this.mouseEnabled;
        }
        this.mouseEnabled = false;
    }

    private restoreTransitionInput(): void {
        if (this.mouseEnabledBeforeTransition === undefined) return;
        this.mouseEnabled = this.mouseEnabledBeforeTransition;
        this.mouseEnabledBeforeTransition = undefined;
    }

    private endPresentation(scope = this.presentationScopeValue): void {
        if (scope === this.presentationScopeValue) {
            this.presentationScopeValue = undefined;
            this.bindingGuard.invalidate();
        }
        scope?.dispose();
    }

    private disposePresentation(): void {
        const scope = this.presentationScopeValue;
        this.presentationScopeValue = undefined;
        scope?.dispose();
    }
}

function captureTransform(widget: Laya.GWidget): WindowTransformSnapshot {
    return Object.freeze({
        x: widget.x,
        y: widget.y,
        scaleX: widget.scaleX,
        scaleY: widget.scaleY,
    });
}

function applyCenteredScale(
    widget: Laya.GWidget,
    baseline: WindowTransformSnapshot,
    scale: number,
): void {
    applyTransform(widget, centeredScale(baseline, widget, scale));
}

function centeredScale(
    baseline: WindowTransformSnapshot,
    widget: Laya.GWidget,
    scale: number,
): WindowTransformSnapshot {
    const scaleX = baseline.scaleX * scale;
    const scaleY = baseline.scaleY * scale;
    return {
        x: baseline.x + widget.width * (baseline.scaleX - scaleX) / 2,
        y: baseline.y + widget.height * (baseline.scaleY - scaleY) / 2,
        scaleX,
        scaleY,
    };
}

function applyTransform(widget: Laya.GWidget, value: WindowTransformSnapshot): void {
    widget.x = value.x;
    widget.y = value.y;
    widget.scaleX = value.scaleX;
    widget.scaleY = value.scaleY;
}

function collectCleanup(errors: unknown[], action: () => void): void {
    try {
        action();
    } catch (error) {
        errors.push(error);
    }
}
