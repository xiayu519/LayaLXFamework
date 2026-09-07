import {
    LifetimeCleanupError,
    LifetimeScope,
    type Cleanup,
} from "../../application/lifecycle/LifetimeScope";

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
 * Base class for scenes opened through SceneFlow.
 *
 * The hierarchy declared by the .ls file is loaded before describeResources is
 * called. Extra resources must therefore describe only runtime-selected content
 * that is not already a hierarchy dependency.
 */
export abstract class BaseGameScene<TArgs = void> extends Laya.Scene {
    private readonly sceneLifetime = new LifetimeScope();
    private transitionLoadingCompletion: (() => void) | undefined;
    private transitionPaused = false;
    private transitionLeaving = false;

    constructor() {
        super();
        this.autoDestroyAtClosed = true;
    }

    /** Extra, runtime-selected resources required before this scene is opened. */
    protected describeResources(_args: TArgs): readonly SceneResourceRequest[] {
        return [];
    }

    /** Runs after all declared resources load and before the scene is opened. */
    protected onPrepare(_context: ScenePhaseContext<TArgs>): void | Promise<void> {}

    /** Runs after open while the loading overlay still covers the scene. */
    protected onWaitUntilReady(_context: ScenePhaseContext<TArgs>): void | Promise<void> {}

    /** Pauses outgoing side effects after Loading is visible and before destructive release. */
    protected onTransitionPause(_context: SceneTransitionPauseContext): void | Promise<void> {}

    /** Resumes only when transition failure happens before destructive release starts. */
    protected onTransitionResume(): void | Promise<void> {}

    /** Runs once immediately before this scene is destroyed and its resources are collected. */
    protected onTransitionLeaving(): void | Promise<void> {}

    /** Registers scene-owned UI handles, timers, tweens or other synchronous cleanup. */
    protected own(cleanup: Cleanup): Cleanup {
        return this.sceneLifetime.defer(cleanup);
    }

    /**
     * Completes this scene's request-owned loading session when autoCloseLoading is false.
     * Calls from a stale or destroyed scene are ignored by SceneFlow.
     */
    protected completeTransitionLoading(): void {
        this.transitionLoadingCompletion?.();
    }

    /** @internal Called only by SceneFlow. */
    getTransitionResources(args: TArgs): readonly SceneResourceRequest[] {
        return this.describeResources(args);
    }

    /** @internal Called only by SceneFlow. */
    prepareForTransition(context: ScenePhaseContext<TArgs>): void | Promise<void> {
        return this.onPrepare(context);
    }

    /** @internal Called only by SceneFlow. */
    waitUntilTransitionReady(context: ScenePhaseContext<TArgs>): void | Promise<void> {
        return this.onWaitUntilReady(context);
    }

    /** @internal Called only by SceneFlow. */
    async pauseForTransition(context: SceneTransitionPauseContext): Promise<void> {
        if (this.transitionPaused || this.transitionLeaving) return;
        await this.onTransitionPause(context);
        this.transitionPaused = true;
    }

    /** @internal Called only by SceneFlow. */
    async resumeAfterTransitionFailure(): Promise<void> {
        if (!this.transitionPaused || this.transitionLeaving || this.destroyed) return;
        await this.onTransitionResume();
        this.transitionPaused = false;
    }

    /** @internal Called only by SceneFlow. */
    async leaveForTransition(): Promise<void> {
        if (this.transitionLeaving || this.destroyed) return;
        this.transitionLeaving = true;
        await this.onTransitionLeaving();
    }

    /** @internal Called only by SceneFlow. */
    bindTransitionLoadingCompletion(completion: () => void): void {
        this.transitionLoadingCompletion = completion;
    }

    override destroy(destroyChild = true): void {
        if (this.destroyed) return;
        this.transitionLoadingCompletion = undefined;
        const errors: unknown[] = [];
        try {
            this.sceneLifetime.dispose();
        } catch (error) {
            if (error instanceof LifetimeCleanupError) errors.push(...error.errors);
            else errors.push(error);
        }
        try {
            super.destroy(destroyChild);
        } catch (error) {
            errors.push(error);
        }
        if (errors.length > 0) throw new SceneLifecycleCleanupError(errors);
    }
}

export class SceneLifecycleCleanupError extends Error {
    constructor(readonly errors: readonly unknown[]) {
        super(`${errors.length} scene cleanup operation(s) failed.`);
        this.name = "SceneLifecycleCleanupError";
    }
}
