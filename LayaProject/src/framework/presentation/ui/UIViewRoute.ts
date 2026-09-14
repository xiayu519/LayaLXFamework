import type { LifetimeScope } from "../../application/lifecycle/LifetimeScope";
import type { BindingToken } from "../../application/ui/AsyncBindingGuard";
import type { SceneUI } from "./SceneUI";
import type { UIBindings } from "./UIBindings";
import type { UIShowOptions } from "./UIRouter";

/** 静态指定的 GWidget Runtime，预制体根节点带有 UIViewLifecycle，不额外包装 GWindow。 */
export interface UIViewRoute<TArgs, TView extends Laya.GWidget = Laya.GWidget> {
    readonly id: string;
    readonly url: string;
    /** 可选的依赖注入；未提供时调用资源所配置 Runtime 的 onBind(args, session)。 */
    bind?(view: TView, args: TArgs, session: UIViewSession): void | Promise<void>;
    /** 一次已展示界面关闭后执行一次，此时节点可能已销毁。 */
    onClosed?(view: TView, args: TArgs): void;
}

export interface UIViewSession {
    readonly ui: SceneUI;
    readonly token: BindingToken;
    readonly lifetime: LifetimeScope;
    readonly bindData: UIBindings["bindData"];
    readonly bindRedDot: UIBindings["bindRedDot"];
    /** 子 UI 继承当前宿主，其生命周期不能超出本次展示。 */
    show<TArgs, TView extends Laya.GWidget>(route: UIViewRoute<TArgs, TView>, args: NoInfer<TArgs>, options?: UIShowOptions): Promise<TView>;
    show<TArgs>(route: string, args: TArgs, options?: UIShowOptions): Promise<Laya.GWidget>;
    close(): void;
}
