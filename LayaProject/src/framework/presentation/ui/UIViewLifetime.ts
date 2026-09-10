import type { LifetimeScope } from "../../application/lifecycle/LifetimeScope";
import type { BindingToken, AsyncBindingGuard } from "../../application/ui/AsyncBindingGuard";
import type { UIBindings } from "./UIBindings";
import type { UIRequestTracker } from "./UIRequestTracker";
import type { UIPopupTransition } from "./UIPopupTransition";
import type { UIViewRoute } from "./UIViewRoute";

export interface UIViewOwner {
    readonly requests: UIRequestTracker;
    readonly records: Set<UIViewRecord>;
    readonly parent?: UIViewRecord;
    open: boolean;
}

export interface UIViewPresentation extends UIViewOwner {
    readonly lifetime: LifetimeScope;
    readonly bindings: UIBindings;
    readonly token: BindingToken;
}

export interface UIViewRecord {
    readonly route: UIViewRoute<unknown>;
    readonly view: Laya.GWidget;
    readonly owner: UIViewOwner;
    readonly guard: AsyncBindingGuard;
    readonly transition?: UIPopupTransition;
    presentation?: UIViewPresentation;
    args?: unknown;
    shown: boolean;
    closing: boolean;
    destroying: boolean;
    cleanupFailure?: unknown;
    lifetimeFailure?: unknown;
}

interface LifetimeObserver extends Laya.Script {
    bindings?: () => UIBindings | undefined;
    viewDestroyed?: () => void;
    failed?: (error: unknown) => void;
}
let observerType: (new () => LifetimeObserver) | undefined;

/** Native activation/destruction also releases subscriptions when callers destroy a view directly. */
export function observeViewLifetime(view: Laya.GWidget, bindings: () => UIBindings | undefined,
    destroyed: () => void, failed: (error: unknown) => void): void {
    observerType ??= class extends Laya.Script {
        bindings?: () => UIBindings | undefined;
        viewDestroyed?: () => void;
        failed?: (error: unknown) => void;
        override onEnable(): void { this.observe(() => this.bindings?.()?.setActive(true)); }
        override onDisable(): void {
            this.observe(() => {
                if (this.owner.destroyed) this.viewDestroyed?.();
                else this.bindings?.()?.setActive(false);
            });
        }
        override onDestroy(): void {
            this.observe(() => this.viewDestroyed?.());
            this.bindings = undefined;
            this.viewDestroyed = undefined;
            this.failed = undefined;
        }
        private observe(action: () => void): void {
            // Native Node.destroy has already marked the node destroyed. Throwing here would strand its children.
            try { action(); } catch (error) { this.failed?.(error); }
        }
    };
    const observer = view.addComponent(observerType);
    observer.bindings = bindings;
    observer.viewDestroyed = destroyed;
    observer.failed = failed;
}
