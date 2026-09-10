import type { LifetimeScope } from "../../application/lifecycle/LifetimeScope";
import type { BindingToken } from "../../application/ui/AsyncBindingGuard";
import type { SceneUI } from "./SceneUI";
import type { UILayer } from "./UILayer";
import type { UIWindowLayout } from "./UILayoutService";
import type { UIBindings } from "./UIBindings";
import type { UIShowOptions } from "./UIRouter";

/** A native prefab Runtime is the view itself; no GWindow or generated binding wrapper. */
export interface UIViewRoute<TArgs, TView extends Laya.GWidget = Laya.GWidget> {
    readonly id: string;
    readonly url: string;
    readonly viewType: new () => TView;
    readonly layer?: UILayer;
    readonly layout?: UIWindowLayout;
    /** Page navigation and input modality are independent from layout and ownership. */
    readonly navigation?: "page" | "overlay";
    readonly modal?: boolean;
    readonly closeOnMaskClick?: boolean;
    /** Singleton is per owner: scene.ui or the opening UI session. */
    readonly multiplicity?: "singleton" | "multiple";
    readonly retention?: "hide" | "destroy";
    bind(view: TView, args: TArgs, session: UIViewSession): void | Promise<void>;
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
