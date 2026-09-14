import { createAbortController } from "../../application/lifecycle/createAbortController";
import {
    LifetimeCleanupError,
    LifetimeScope,
    type Cleanup,
} from "../../application/lifecycle/LifetimeScope";
import type { SceneUI } from "../ui/SceneUI";

export interface SceneResourceRequest {
    readonly url: string;
    readonly type?: string;
    readonly priority?: number;
    readonly cache?: boolean;
    readonly noRetry?: boolean;
}

export interface ScenePhaseContext<TArgs> {
    readonly args: TArgs;
    readonly signal: AbortSignal;
    reportProgress(progress: number): void;
}

export interface SceneTransitionPauseContext {
    readonly nextRouteId: string;
}

/**
 * 通过 SceneFlow 打开的场景基类。
 *
 * 调用 describeResources 前，.ls 声明的节点层级已加载完成。
 * 额外资源只应声明运行时选择的内容，
 * 不要重复声明已有的层级依赖。
 */
export abstract class BaseGameScene<TArgs = void> extends Laya.Scene {
    /** 使用原生 Runtime 导出变量 uiRoot，或在首次访问 ui 前赋值为已导出的节点。 */
    public uiRoot: Laya.GWidget | null = null;
    private readonly sceneLifetime = new LifetimeScope();
    private readonly sceneController = createAbortController();
    private transitionLoadingCompletion: (() => void) | undefined;
    private transitionPaused = false;
    private transitionLeaving = false;
    private uiFactory: (() => SceneUI) | undefined;
    private uiValue: SceneUI | undefined;

    /** 取消场景持有的异步获取；与切换过程的 context.signal 不同，此信号覆盖场景完整生命周期。 */
    public get signal(): AbortSignal {
        return this.sceneController.signal;
    }

    /** 当前场景实例持有的 UI，不会隐式转向 SceneFlow.current。 */
    public get ui(): SceneUI {
        if (this.destroyed || this.transitionLeaving && !this.uiValue) {
            throw new Error("Scene UI is no longer available.");
        }
        if (!this.uiValue) {
            if (!this.uiFactory) {
                throw new Error("Scene UI is not configured; open this scene through lx.scenes.");
            }
            this.uiValue = this.uiFactory();
        }
        return this.uiValue;
    }

    /** @internal 在准备阶段前配置；没有 UI 的场景不分配 UI 上下文。 */
    public configureUI(factory: () => SceneUI): void {
        if (this.uiFactory) {
            throw new Error("Scene UI was already configured.");
        }
        this.uiFactory = factory;
    }

    /** @internal 必须等待原生加载结束，Scene.gc 才能回收旧层级依赖。 */
    public async waitForUI(): Promise<void> {
        await this.uiValue?.waitForPendingLoads();
    }

    public constructor() {
        super();
        this.autoDestroyAtClosed = true;
    }

    /** 场景打开前需要加载的额外资源，由运行时选择。 */
    protected describeResources(_args: TArgs): readonly SceneResourceRequest[] {
        return [];
    }

    /** 所有声明资源加载完成后、场景打开前执行。 */
    protected onPrepare(_context: ScenePhaseContext<TArgs>): void | Promise<void> {
    }

    /** 场景打开后执行，此时 Loading 仍覆盖场景。 */
    protected onWaitUntilReady(_context: ScenePhaseContext<TArgs>): void | Promise<void> {
    }

    /** Loading 可见后、开始销毁资源前，暂停旧场景的副作用。 */
    protected onTransitionPause(_context: SceneTransitionPauseContext): void | Promise<void> {
    }

    /** 仅在切换失败且尚未开始销毁资源时恢复。 */
    protected onTransitionResume(): void | Promise<void> {
    }

    /** 场景销毁和资源回收前执行一次。 */
    protected onTransitionLeaving(): void | Promise<void> {
    }

    /** 登记场景持有的 UI 句柄、timer、Tween 或其他同步清理操作。 */
    protected own(cleanup: Cleanup): Cleanup {
        return this.sceneLifetime.defer(cleanup);
    }

    /**
     * autoCloseLoading 为 false 时，结束本场景请求持有的 Loading 展示。
     * SceneFlow 会忽略失效或已销毁场景发起的调用。
     */
    protected completeTransitionLoading(): void {
        this.transitionLoadingCompletion?.();
    }

    /** @internal 仅由 SceneFlow 调用。 */
    public getTransitionResources(args: TArgs): readonly SceneResourceRequest[] {
        return this.describeResources(args);
    }

    /** @internal 仅由 SceneFlow 调用。 */
    public prepareForTransition(context: ScenePhaseContext<TArgs>): void | Promise<void> {
        return this.onPrepare(context);
    }

    /** @internal 仅由 SceneFlow 调用。 */
    public waitUntilTransitionReady(context: ScenePhaseContext<TArgs>): void | Promise<void> {
        return this.onWaitUntilReady(context);
    }

    /** @internal 仅由 SceneFlow 调用。 */
    public async pauseForTransition(context: SceneTransitionPauseContext): Promise<void> {
        if (this.transitionPaused || this.transitionLeaving) {
            return;
        }
        await this.onTransitionPause(context);
        this.transitionPaused = true;
    }

    /** @internal 仅由 SceneFlow 调用。 */
    public async resumeAfterTransitionFailure(): Promise<void> {
        if (!this.transitionPaused || this.transitionLeaving || this.destroyed) {
            return;
        }
        await this.onTransitionResume();
        this.transitionPaused = false;
    }

    /** @internal 仅由 SceneFlow 调用。 */
    public async leaveForTransition(): Promise<void> {
        if (this.transitionLeaving || this.destroyed) {
            return;
        }
        this.transitionLeaving = true;
        this.sceneController.abort();
        await this.onTransitionLeaving();
    }

    /** @internal 仅由 SceneFlow 调用。 */
    public bindTransitionLoadingCompletion(completion: () => void): void {
        this.transitionLoadingCompletion = completion;
    }

    public override destroy(destroyChild = true): void {
        if (this.destroyed) {
            return;
        }
        this.sceneController.abort();
        this.transitionLoadingCompletion = undefined;
        this.uiFactory = undefined;
        const errors: unknown[] = [];
        try {
            this.uiValue?.dispose();
        } catch (error) {
            errors.push(error);
        }
        try {
            this.sceneLifetime.dispose();
        } catch (error) {
            if (error instanceof LifetimeCleanupError) {
                errors.push(...error.errors);
            } else {
                errors.push(error);
            }
        }
        try {
            super.destroy(destroyChild);
        } catch (error) {
            errors.push(error);
        }
        if (errors.length > 0) {
            throw new SceneLifecycleCleanupError(errors);
        }
    }
}

export class SceneLifecycleCleanupError extends Error {
    public constructor(public readonly errors: readonly unknown[]) {
        super(`${errors.length} scene cleanup operation(s) failed.`);
        this.name = "SceneLifecycleCleanupError";
    }
}
