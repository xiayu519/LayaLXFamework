import type { LifetimeScope } from "../../application/lifecycle/LifetimeScope";
import type { BindingToken } from "../../application/ui/AsyncBindingGuard";
import type { SceneUI } from "./SceneUI";
import type { UIBindings } from "./UIBindings";
import type { UIShowOptions } from "./UIRouter";

/** A statically assigned GWidget Runtime with UIViewLifecycle on its prefab root; no GWindow wrapper. */
export interface UIViewRoute<TArgs, TView extends Laya.GWidget = Laya.GWidget> {
    readonly id: string;
    readonly url: string;
    /** Optional dependency injection. Otherwise the authored Runtime's onBind(args, session) is called. */
    bind?(view: TView, args: TArgs, session: UIViewSession): void | Promise<void>;
    /** Runs once after a displayed presentation closes. Nodes may already be destroyed. */
    onClosed?(view: TView, args: TArgs): void;
}

export interface UIViewSession {
    readonly ui: SceneUI;
    readonly token: BindingToken;
    readonly lifetime: LifetimeScope;
    readonly bindData: UIBindings["bindData"];
    readonly bindRedDot: UIBindings["bindRedDot"];
    /** A child UI inherits this host and cannot outlive this presentation. */
    show<TArgs, TView extends Laya.GWidget>(route: UIViewRoute<TArgs, TView>, args: NoInfer<TArgs>, options?: UIShowOptions): Promise<TView>;
    show<TArgs>(route: string, args: TArgs, options?: UIShowOptions): Promise<Laya.GWidget>;
    close(): void;
}
