import type { LifetimeScope } from "../../application/lifecycle/LifetimeScope";
import type { BindingToken, AsyncBindingGuard } from "../../application/ui/AsyncBindingGuard";
import type { UIBindings } from "./UIBindings";
import type { UIRequest, UIRequestTracker } from "./UIRequestTracker";
import type { UIPopupTransition } from "./UIPopupTransition";
import type { UIViewRoute } from "./UIViewRoute";
import type { UIViewSettings } from "./UIViewLifecycle";

export interface UIViewOwner {
    readonly requests: UIRequestTracker;
    readonly pending: Set<UIRequest>;
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
    readonly settings: UIViewSettings;
    readonly view: Laya.GWidget;
    readonly owner: UIViewOwner;
    readonly guard: AsyncBindingGuard;
    readonly transition?: UIPopupTransition;
    presentation?: UIViewPresentation;
    args?: unknown;
    /** Metadata discovery may prepare a singleton for a newer first-open request. */
    initializing: boolean;
    shown: boolean;
    closing: boolean;
    destroying: boolean;
    cleanupFailure?: unknown;
    lifetimeFailure?: unknown;
}
