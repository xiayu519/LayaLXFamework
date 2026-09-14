import { logger } from "../../application/diagnostics/Logger";
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
    /** 即使取消使 present() 立即结束，仍跟踪底层未完成的工作。 */
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
        // 原生自动输入模式读取为 false；Tween 后按此值恢复会禁用整个子树。
        // GWindow 已监听鼠标输入，因此在过渡前显式启用输入。
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

    public get destructionComplete(): boolean {
        return this.destructionCompleteValue;
    }

    /** 原生 destroyed 可能在清理抛错前已变为 true，不能据此认定清理完成。 */
    public get destructionFailure(): LifetimeCleanupError | undefined {
        return this.destructionFailureValue;
    }

    /** @internal 路由器在下次展示前提供共享数据。 */
    public configureBindings(redDots: RedDotStore | undefined): void {
        this.redDots = redDots;
    }

    protected bindData(source: Laya.EventDispatcher, event: string | readonly string[], render: () => void): () => void {
        return this.requireBindings().bindData(source, event, render);
    }

    protected bindRedDot(badge: Laya.Sprite, key: string, options?: RedDotOptions): () => void {
        return this.requireBindings().bindRedDot(badge, key, options);
    }

    /** @internal 由 UIRouter 根据已解析的窗口布局配置。 */
    public configurePopupTransition(enabled: boolean): void {
        if (this.popupTransitionEnabled === enabled) {
            return;
        }
        this.popupTransition.cancel();
        this.popupTransitionEnabled = enabled;
        this.mouseThrough = enabled;
    }

    /** @internal 让 UIRouter 在销毁策略的弹窗关闭前播放隐藏动画。 */
    public get hasPopupTransition(): boolean {
        return this.popupTransitionEnabled;
    }

    /** @internal 重新布局时先取消指向旧位置的 Tween，再重启当前过渡。 */
    public updateLayout(applyLayout: () => void): void {
        const phase = this.popupTransition.phase;
        this.popupTransition.cancel();
        applyLayout();
        if (!this.isShowing) {
            return;
        }
        if (phase === "showing") {
            this.doShowAnimation();
        } else if (phase === "hiding") {
            this.doHideAnimation();
        }
    }

    /** @internal 由 UIRouter 配置，使原生关闭按钮遵循路由的保留策略。 */
    public configureDestroyWhenHidden(enabled: boolean): void {
        this.destroyWhenHidden = enabled;
    }

    /** @internal 供 UIRouter 处理显示请求与尚未结束的隐藏动画之间的竞态。 */
    public get isPopupHiding(): boolean {
        return this.popupTransition.phase === "hiding";
    }

    /** @internal 再次展示同一弹窗实例前，先完成其尚未结束的隐藏过程。 */
    public finishPopupHideImmediately(): void {
        if (!this.isPopupHiding) {
            return;
        }
        const errors: unknown[] = [];
        collectCleanup(errors, () => this.popupTransition.cancel());
        collectCleanup(errors, () => {
            if (this.isShowing) {
                this.hideImmediately();
            }
        });
        if (errors.length > 0) {
            throw new LifetimeCleanupError(errors);
        }
    }

    public async present(args: TArgs, signal?: AbortSignal): Promise<boolean> {
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
            if (cancelled) {
                return false;
            }
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

    public hideForReuse(): void {
        this.hide();
    }

    public override hide(): void {
        const errors: unknown[] = [];
        collectCleanup(errors, () => this.endPresentation());
        collectCleanup(errors, () => super.hide());
        if (errors.length > 0) {
            throw new LifetimeCleanupError(errors);
        }
    }

    public override bringToFront(): void {
        super.bringToFront();
        this.lifecycleObserver?.onOrderChanged?.(this as unknown as BaseGameWindow<unknown>);
    }

    protected override doShowAnimation(): void {
        if (!this.popupTransitionEnabled) {
            super.doShowAnimation();
            return;
        }

        this.popupTransition.show(() => {
            if (!this.destroyed && this.isShowing) {
                this.onShown();
            }
        });
    }

    protected override doHideAnimation(): void {
        if (!this.popupTransitionEnabled) {
            if (this.destroyWhenHidden) {
                this.destroy();
            } else {
                super.doHideAnimation();
            }
            return;
        }
        this.popupTransition.hide(() => {
            if (this.destroyed || !this.isShowing) {
                return;
            }
            if (this.destroyWhenHidden) {
                this.destroy();
            } else {
                this.hideImmediately();
            }
        });
    }

    /** @internal 供 UIRouter 监听原生 GWindow 的隐藏与销毁生命周期。 */
    public observeLifecycle(observer: WindowLifecycleObserver): void {
        if (this.lifecycleObserver && this.lifecycleObserver !== observer) {
            throw new Error("Window lifecycle observer is already assigned.");
        }
        this.lifecycleObserver = observer;
    }

    public override destroy(): void {
        if (this.destroying) {
            return;
        }
        if (this.destructionFailureValue) {
            throw this.destructionFailureValue;
        }
        if (this.destroyed) {
            return;
        }
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
                if (!this.destroyed) {
                    throw new Error("GWindow.destroy() returned without destroying the window.");
                }
                nativeCompleted = true;
            } catch (error) {
                errors.push(error);
                if (this.destroyed) {
                    permanentErrors.push(error);
                }
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
        // UNDISPLAY 触发时，原生父节点和排序记录尚未更新完成；业务代码延后到
        // 下一次微任务执行，确保 hideImmediately/destroy 已完成同步清理。
        if (notifyClosed) {
            void Promise.resolve().then(() => {
                try {
                    this.onClosed();
                }
                catch (error) {
                    logger.error("[UI] onClosed failed after window cleanup", error);
                }
            });
        }
        if (errors.length > 0) {
            throw new LifetimeCleanupError(errors);
        }
    }

    protected abstract onBind(args: TArgs, token: BindingToken): void | Promise<void>;

    /** 已展示窗口隐藏后排队执行一次；不得访问节点，也不替代 hide/destroy 的清理。 */
    protected onClosed(): void {
    }

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
        if (!this.presentationBindings) {
            throw new Error("The window has no active presentation bindings.");
        }
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
