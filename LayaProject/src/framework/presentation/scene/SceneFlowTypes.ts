export type SceneTransitionPhase =
    | "scene"
    | "resources"
    | "prepare"
    | "switch"
    | "cleanup"
    | "ready";

export interface SceneTransitionProgress {
    readonly requestId: number;
    readonly routeId: string;
    readonly phase: SceneTransitionPhase;
    readonly phaseProgress: number;
    readonly scene: number;
    readonly resources: number;
    readonly overall: number;
}

export interface SceneRoute<TArgs> {
    readonly id: string;
    readonly url: string;
}

export interface SceneOpenOptions {
    /** Shows the configured System-layer loading UI. Defaults to true. */
    readonly showLoading?: boolean;
    /** Hides loading after the scene reaches ready. Defaults to true. */
    readonly autoCloseLoading?: boolean;
    readonly signal?: AbortSignal;
    readonly onProgress?: (progress: SceneTransitionProgress) => void;
}

export interface SceneLoadingPresenter {
    show(progress: SceneTransitionProgress): void | Promise<void>;
    update(progress: SceneTransitionProgress): void;
    fail(progress: SceneTransitionProgress, error: unknown): void;
    hide(): void;
}

export interface SceneFlowOptions {
    /** @internal Runtime composition configures scene-local UI before preparation. */
    readonly configureScene?: (scene: import("./BaseGameScene").BaseGameScene<unknown>) => void;
    readonly loadingPresenter?: SceneLoadingPresenter;
    readonly waitForFrame?: () => Promise<void>;
    /** @internal SceneRegistry defers global collection while sibling scene owners are unsettled. */
    readonly collectGarbage?: () => void;
}

export interface SceneFlowSnapshot {
    readonly state: "idle" | "transitioning" | "disposed";
    readonly currentRouteId?: string;
    readonly registeredRoutes: readonly string[];
    readonly requestVersion: number;
    readonly pendingTransitions: number;
    readonly progress?: SceneTransitionProgress;
    readonly lastError?: string;
}

export class SceneTransitionCancelledError extends Error {
    constructor() {
        super("Scene transition was cancelled or superseded.");
        this.name = "SceneTransitionCancelledError";
    }
}

export class SceneCreationError extends Error {
    constructor(readonly routeId: string, readonly errors: readonly unknown[]) {
        super(`Scene route '${routeId}' reported ${errors.length} creation error(s).`);
        this.name = "SceneCreationError";
    }
}

export class SceneFlowCleanupError extends Error {
    constructor(readonly errors: readonly unknown[]) {
        super(`${errors.length} scene flow cleanup operation(s) failed.`);
        this.name = "SceneFlowCleanupError";
    }
}

export class SceneTransitionFailureError extends Error {
    constructor(readonly cause: unknown, readonly cleanupErrors: readonly unknown[]) {
        super(`Scene transition failed and ${cleanupErrors.length} cleanup/recovery operation(s) also failed.`);
        this.name = "SceneTransitionFailureError";
    }
}
