import {
    LifetimeCleanupError,
    LifetimeScope,
} from "../../application/lifecycle/LifetimeScope";
import { AsyncBindingGuard, type BindingToken } from "../../application/ui/AsyncBindingGuard";

export interface WindowLifecycleObserver {
    onHidden(window: BaseGameWindow<unknown>): void;
    onDestroyed(window: BaseGameWindow<unknown>): void;
}

export abstract class BaseGameWindow<TArgs> extends Laya.GWindow {
    private readonly bindingGuard = new AsyncBindingGuard();
    private readonly lifetimeScope = new LifetimeScope();
    private presentationScopeValue: LifetimeScope | undefined;
    private lifecycleObserver: WindowLifecycleObserver | undefined;

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

    async present(args: TArgs): Promise<boolean> {
        this.endPresentation();
        this.presentationScopeValue = new LifetimeScope();
        const token = this.bindingGuard.next();
        try {
            await this.onBind(args, token);
        } catch (error) {
            this.endPresentation();
            throw error;
        }
        if (!token.isCurrent()) {
            this.endPresentation();
            return false;
        }
        this.show();
        return true;
    }

    hideForReuse(): void {
        this.endPresentation();
        this.hide();
    }

    /** @internal UI 路由用于同步原生 GWindow hide/destroy 生命周期。 */
    observeLifecycle(observer: WindowLifecycleObserver): void {
        if (this.lifecycleObserver && this.lifecycleObserver !== observer) {
            throw new Error("Window lifecycle observer is already assigned.");
        }
        this.lifecycleObserver = observer;
    }

    override destroy(): void {
        if (this.destroyed) {
            return;
        }
        const errors: unknown[] = [];
        this.bindingGuard.dispose();
        collectCleanup(errors, () => this.disposePresentation());
        collectCleanup(errors, () => this.lifetimeScope.dispose());
        collectCleanup(errors, () => super.destroy());
        this.lifecycleObserver?.onDestroyed(this as unknown as BaseGameWindow<unknown>);
        this.lifecycleObserver = undefined;
        if (errors.length > 0) {
            throw new LifetimeCleanupError(errors);
        }
    }

    protected override onHide(): void {
        const errors: unknown[] = [];
        this.bindingGuard.invalidate();
        collectCleanup(errors, () => this.disposePresentation());
        collectCleanup(errors, () => super.onHide());
        this.lifecycleObserver?.onHidden(this as unknown as BaseGameWindow<unknown>);
        if (errors.length > 0) {
            throw new LifetimeCleanupError(errors);
        }
    }

    protected requireChild<TNode extends Laya.Node>(name: string, type: new (...args: any[]) => TNode): TNode {
        return this.contentPane.findChild(name, type);
    }

    protected abstract onBind(args: TArgs, token: BindingToken): void | Promise<void>;

    private endPresentation(): void {
        this.bindingGuard.invalidate();
        this.disposePresentation();
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
