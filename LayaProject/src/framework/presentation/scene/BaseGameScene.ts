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
 * Base class for scenes opened through SceneFlow.
 *
 * The hierarchy declared by the .ls file is loaded before describeResources is
 * called. Extra resources must therefore describe only runtime-selected content
 * that is not already a hierarchy dependency.
 */
export abstract class BaseGameScene<TArgs = void> extends Laya.Scene {
    /** Native Runtime export variable uiRoot, or assign an exported node before first accessing ui. */
    uiRoot: Laya.GWidget | null = null;

    private readonly sceneLifetime = new LifetimeScope();
    private readonly sceneController = new AbortController();
    private transitionLoadingCompletion: (() => void) | undefined;
    private transitionPaused = false;
    private transitionLeaving = false;
    private uiFactory: (() => SceneUI) | undefined;
    private uiValue: SceneUI | undefined;

    /** Cancel scene-owned async acquisitions; unlike transition context.signal this spans the whole scene. */
    get signal(): AbortSignal { return this.sceneController.signal; }

    /** This scene instance's UI; never implicitly redirects to SceneFlow.current. */
    get ui(): SceneUI {
        if (this.destroyed || this.transitionLeaving && !this.uiValue) throw new Error("Scene UI is no longer available.");
        if (!this.uiValue) {
            if (!this.uiFactory) throw new Error("Scene UI is not configured; open this scene through lx.scenes.");
            this.uiValue = this.uiFactory();
        }
        return this.uiValue;
    }

    /** @internal Configured before preparation; scenes that have no UI allocate no UI context. */
    configureUI(factory: () => SceneUI): void {
        if (this.uiFactory) throw new Error("Scene UI was already configured.");
        this.uiFactory = factory;
    }

    /** @internal Pending native loads must settle before Scene.gc can collect old hierarchy dependencies. */
    async waitForUI(): Promise<void> { await this.uiValue?.waitForPendingLoads(); }

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
        this.sceneController.abort();
        await this.onTransitionLeaving();
    }

    /** @internal Called only by SceneFlow. */
    bindTransitionLoadingCompletion(completion: () => void): void {
        this.transitionLoadingCompletion = completion;
    }

    override destroy(destroyChild = true): void {
        if (this.destroyed) return;
        this.sceneController.abort();
        this.transitionLoadingCompletion = undefined;
        this.uiFactory = undefined;
        const errors: unknown[] = [];
        try { this.uiValue?.dispose(); } catch (error) { errors.push(error); }
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
