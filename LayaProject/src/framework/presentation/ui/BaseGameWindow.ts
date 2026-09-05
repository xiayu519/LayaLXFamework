import {
    LifetimeCleanupError,
    LifetimeScope,
} from "../../application/lifecycle/LifetimeScope";
import { AsyncBindingGuard, awaitBinding, type BindingToken } from "../../application/ui/AsyncBindingGuard";

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

    protected constructor(contentPane: Laya.GWidget) {
        super();
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

function collectCleanup(errors: unknown[], action: () => void): void {
    try {
        action();
    } catch (error) {
        errors.push(error);
    }
}
