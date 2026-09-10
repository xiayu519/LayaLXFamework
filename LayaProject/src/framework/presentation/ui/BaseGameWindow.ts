import {
    LifetimeCleanupError,
    LifetimeScope,
} from "../../application/lifecycle/LifetimeScope";
import { AsyncBindingGuard, awaitBinding, type BindingToken } from "../../application/ui/AsyncBindingGuard";
import type { RedDotStore } from "./RedDotStore";
import { UIBindings, type RedDotOptions } from "./UIBindings";
import { UIPopupTransition } from "./UIPopupTransition";

export interface WindowLifecycleObserver {
    onHidden(window: BaseGameWindow<unknown>): void;
    onDestroyed(window: BaseGameWindow<unknown>): void;
    onOrderChanged?(window: BaseGameWindow<unknown>): void;
    /** Keep underlying work tracked even when cancellation ends present() immediately. */
    onBinding?(operation: Promise<void>): void;
}

export abstract class BaseGameWindow<TArgs> extends Laya.GWindow {
    private readonly bindingGuard = new AsyncBindingGuard();
    private readonly lifetimeScope = new LifetimeScope();
    private presentationScopeValue: LifetimeScope | undefined;
    private presentationBindings: UIBindings | undefined;
    private redDots: RedDotStore | undefined;
    private lifecycleObserver: WindowLifecycleObserver | undefined;
    private destroying = false;
    private destructionCompleteValue = false;
    private destructionFailureValue: LifetimeCleanupError | undefined;
    private popupTransitionEnabled = false;
    private readonly popupTransition: UIPopupTransition;
    private destroyWhenHidden = false;
    private closeNotificationPending = false;

    protected constructor(contentPane: Laya.GWidget) {
        super();
        // Native auto input reads as false; restoring that boolean after a Tween disables the subtree.
        // GWindow already listens for mouse input. Make its enabled state explicit before transitions.
        this.mouseEnabled = true;
        this.contentPane = contentPane;
        this.popupTransition = new UIPopupTransition(this, contentPane);
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

    /** @internal The router supplies shared data before the next presentation. */
    configureBindings(redDots: RedDotStore | undefined): void {
        this.redDots = redDots;
    }

    protected bindData(source: Laya.EventDispatcher, event: string | readonly string[], render: () => void): () => void {
        return this.requireBindings().bindData(source, event, render);
    }

    protected bindRedDot(badge: Laya.Sprite, key: string, options?: RedDotOptions): () => void {
        return this.requireBindings().bindRedDot(badge, key, options);
    }

    /** @internal Configured by UIRouter from the resolved window layout. */
    configurePopupTransition(enabled: boolean): void {
        if (this.popupTransitionEnabled === enabled) return;
        this.popupTransition.cancel();
        this.popupTransitionEnabled = enabled;
        this.mouseThrough = enabled;
    }

    /** @internal Allows UIRouter to route destroy-retained popups through their hide animation. */
    get hasPopupTransition(): boolean { return this.popupTransitionEnabled; }

    /** @internal Relayout cancels stale Tween targets before restarting the active transition. */
    updateLayout(applyLayout: () => void): void {
        const phase = this.popupTransition.phase;
        this.popupTransition.cancel();
        applyLayout();
        if (!this.isShowing) return;
        if (phase === "showing") this.doShowAnimation();
        else if (phase === "hiding") this.doHideAnimation();
    }

    /** @internal Configured by UIRouter so native close buttons honor route retention. */
    configureDestroyWhenHidden(enabled: boolean): void {
        this.destroyWhenHidden = enabled;
    }

    /** @internal Allows UIRouter to resolve a show request racing an unfinished hide animation. */
    get isPopupHiding(): boolean { return this.popupTransition.phase === "hiding"; }

    /** @internal Completes a retained popup hide before presenting the same instance again. */
    finishPopupHideImmediately(): void {
        if (!this.isPopupHiding) return;
        const errors: unknown[] = [];
        collectCleanup(errors, () => this.popupTransition.cancel());
        collectCleanup(errors, () => {
            if (this.isShowing) this.hideImmediately();
        });
        if (errors.length > 0) throw new LifetimeCleanupError(errors);
    }

    async present(args: TArgs, signal?: AbortSignal): Promise<boolean> {
        this.endPresentation();
        const scope = new LifetimeScope();
        this.presentationScopeValue = scope;
        const bindings = new UIBindings(this.contentPane, this.redDots);
        this.presentationBindings = bindings;
        scope.defer(() => bindings.dispose());
        const token = this.bindingGuard.next(signal);
        try {
            if (token.isCurrent()) {
                const binding = Promise.resolve(this.onBind(args, token));
                this.lifecycleObserver?.onBinding?.(binding);
                await awaitBinding(binding, token.signal);
            }
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
        this.closeNotificationPending = true;
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

        this.popupTransition.show(() => {
            if (!this.destroyed && this.isShowing) this.onShown();
        });
    }

    protected override doHideAnimation(): void {
        if (!this.popupTransitionEnabled) {
            if (this.destroyWhenHidden) this.destroy();
            else super.doHideAnimation();
            return;
        }
        this.popupTransition.hide(() => {
            if (this.destroyed || !this.isShowing) return;
            if (this.destroyWhenHidden) this.destroy();
            else this.hideImmediately();
        });
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
            collectCleanup(errors, () => this.popupTransition.cancel());
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
        const notifyClosed = this.closeNotificationPending;
        this.closeNotificationPending = false;
        const errors: unknown[] = [];
        collectCleanup(errors, () => this.popupTransition.cancel());
        this.bindingGuard.invalidate();
        collectCleanup(errors, () => this.disposePresentation());
        collectCleanup(errors, () => super.onHide());
        collectCleanup(errors, () => this.lifecycleObserver?.onHidden(
            this as unknown as BaseGameWindow<unknown>,
        ));
        // UNDISPLAY fires before native parent/order bookkeeping finishes. Run business code
        // in the next microtask, after hideImmediately/destroy has completed its synchronous cleanup.
        if (notifyClosed) void Promise.resolve().then(() => {
            try { this.onClosed(); }
            catch (error) { console.error("[UI] onClosed failed after window cleanup", error); }
        });
        if (errors.length > 0) {
            throw new LifetimeCleanupError(errors);
        }
    }

    protected abstract onBind(args: TArgs, token: BindingToken): void | Promise<void>;

    /** Queued once after a displayed window is hidden. Do not access nodes or replace hide/destroy cleanup. */
    protected onClosed(): void {}

    private endPresentation(scope = this.presentationScopeValue): void {
        if (scope === this.presentationScopeValue) {
            this.presentationScopeValue = undefined;
            this.presentationBindings = undefined;
            this.bindingGuard.invalidate();
        }
        scope?.dispose();
    }

    private disposePresentation(): void {
        const scope = this.presentationScopeValue;
        this.presentationScopeValue = undefined;
        this.presentationBindings = undefined;
        scope?.dispose();
    }

    private requireBindings(): UIBindings {
        if (!this.presentationBindings) throw new Error("The window has no active presentation bindings.");
        return this.presentationBindings;
    }
}

function collectCleanup(errors: unknown[], action: () => void): void {
    try {
        action();
    } catch (error) {
        errors.push(error);
    }
}
