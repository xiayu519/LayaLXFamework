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
    /** 显示配置在 System 层的 Loading UI，默认为 true。 */
    readonly showLoading?: boolean;
    /** 场景就绪后隐藏 Loading，默认为 true。 */
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
    /** @internal 框架组装时，在场景准备前配置其局部 UI。 */
    readonly configureScene?: (scene: import("./BaseGameScene").BaseGameScene<unknown>) => void;
    readonly loadingPresenter?: SceneLoadingPresenter;
    readonly waitForFrame?: () => Promise<void>;
    /** @internal 同级场景持有者尚未稳定时，SceneRegistry 推迟全局回收。 */
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
    public constructor() {
        super("Scene transition was cancelled or superseded.");
        this.name = "SceneTransitionCancelledError";
    }
}

export class SceneCreationError extends Error {
    public constructor(public readonly routeId: string, public readonly errors: readonly unknown[]) {
        super(`Scene route '${routeId}' reported ${errors.length} creation error(s).`);
        this.name = "SceneCreationError";
    }
}

export class SceneFlowCleanupError extends Error {
    public constructor(public readonly errors: readonly unknown[]) {
        super(`${errors.length} scene flow cleanup operation(s) failed.`);
        this.name = "SceneFlowCleanupError";
    }
}

export class SceneTransitionFailureError extends Error {
    public constructor(public readonly cause: unknown, public readonly cleanupErrors: readonly unknown[]) {
        super(`Scene transition failed and ${cleanupErrors.length} cleanup/recovery operation(s) also failed.`);
        this.name = "SceneTransitionFailureError";
    }
}
