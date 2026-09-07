import {
    BaseGameScene,
    SceneLifecycleCleanupError,
} from "./BaseGameScene";
import {
    SceneCreationError,
    SceneFlowCleanupError,
    SceneTransitionCancelledError,
    SceneTransitionFailureError,
    type SceneFlowOptions,
    type SceneFlowSnapshot,
    type SceneLoadingPresenter,
    type SceneOpenOptions,
    type SceneRoute,
    type SceneTransitionProgress,
} from "./SceneFlowTypes";
import {
    toLoadURL,
    validateResourceResults,
    validateResources,
} from "./SceneResourceBatch";
import {
    createPhaseContext,
    TransitionProgressReporter,
} from "./SceneTransitionProgress";

export {
    SceneCreationError,
    SceneFlowCleanupError,
    SceneTransitionCancelledError,
    SceneTransitionFailureError,
} from "./SceneFlowTypes";
export type {
    SceneFlowOptions,
    SceneFlowSnapshot,
    SceneLoadingPresenter,
    SceneOpenOptions,
    SceneRoute,
    SceneTransitionPhase,
    SceneTransitionProgress,
} from "./SceneFlowTypes";

interface SceneRecord {
    readonly route: UnknownRoute;
    readonly scene: UnknownScene;
}

type UnknownRoute = SceneRoute<unknown>;
type UnknownScene = BaseGameScene<unknown>;

export class SceneFlow {
    private readonly routes = new Map<string, UnknownRoute>();
    private readonly pending = new Set<Promise<unknown>>();
    private readonly loadingPresenter?: SceneLoadingPresenter;
    private readonly waitForFrame: () => Promise<void>;
    private currentRecord: SceneRecord | undefined;
    private activeController: AbortController | undefined;
    private pausedScene: UnknownScene | undefined;
    private pauseOperation: { readonly scene: UnknownScene; readonly promise: Promise<void> } | undefined;
    private releaseOperation: Promise<void> | undefined;
    private loadingRequestId: number | undefined;
    private requestVersion = 0;
    private stateValue: SceneFlowSnapshot["state"] = "idle";
    private progressValue: SceneTransitionProgress | undefined;
    private lastErrorValue: string | undefined;

    constructor(options: SceneFlowOptions = {}) {
        this.loadingPresenter = options.loadingPresenter;
        this.waitForFrame = options.waitForFrame ?? waitForNextFrame;
    }

    register<TArgs>(route: SceneRoute<TArgs>): SceneRoute<TArgs> {
        this.requireActive();
        if (!route.id || !route.url) throw new Error("Scene route id and url are required.");
        if (this.routes.has(route.id)) throw new Error(`Duplicate scene route '${route.id}'.`);
        this.routes.set(route.id, route as unknown as UnknownRoute);
        return route;
    }

    open<TArgs>(
        route: SceneRoute<TArgs>, args: NoInfer<TArgs>, options?: SceneOpenOptions,
    ): Promise<BaseGameScene<TArgs>>;
    open<TArgs>(
        routeId: string, args: TArgs, options?: SceneOpenOptions,
    ): Promise<BaseGameScene<TArgs>>;
    open<TArgs>(
        routeOrId: string | SceneRoute<TArgs>, args: TArgs, options: SceneOpenOptions = {},
    ): Promise<BaseGameScene<TArgs>> {
        this.requireActive();
        if (options.signal?.aborted) return Promise.reject(new SceneTransitionCancelledError());
        const routeId = typeof routeOrId === "string" ? routeOrId : routeOrId.id;
        const route = this.requireRoute(routeId);
        if (typeof routeOrId !== "string" && route !== (routeOrId as unknown as UnknownRoute)) {
            return Promise.reject(new Error(`Scene route '${routeId}' is not the registered route object.`));
        }

        const requestId = ++this.requestVersion;
        this.activeController?.abort();
        const controller = new AbortController();
        this.activeController = controller;
        const onAbort = () => controller.abort();
        options.signal?.addEventListener("abort", onAbort, { once: true });
        this.stateValue = "transitioning";
        this.lastErrorValue = undefined;

        const operation = this.openRoute(
            route as SceneRoute<TArgs>, args, options, requestId, controller.signal,
        ).finally(() => {
            options.signal?.removeEventListener("abort", onAbort);
            if (this.requestVersion === requestId && this.stateValue !== "disposed") {
                this.stateValue = "idle";
                this.activeController = undefined;
            }
        });
        this.pending.add(operation);
        operation.then(
            () => this.pending.delete(operation),
            () => this.pending.delete(operation),
        );
        return operation;
    }

    get current(): BaseGameScene<unknown> | undefined {
        return this.currentRecord?.scene;
    }

    snapshot(): SceneFlowSnapshot {
        return Object.freeze({
            state: this.stateValue,
            currentRouteId: this.currentRecord?.route.id,
            registeredRoutes: Object.freeze([...this.routes.keys()]),
            requestVersion: this.requestVersion,
            pendingTransitions: this.pending.size,
            progress: this.progressValue,
            lastError: this.lastErrorValue,
        });
    }

    dispose(): void {
        if (this.stateValue === "disposed") return;
        this.stateValue = "disposed";
        this.requestVersion += 1;
        this.activeController?.abort();
        this.activeController = undefined;
        this.loadingRequestId = undefined;
        const errors: unknown[] = [];
        try {
            this.loadingPresenter?.hide();
        } catch (error) {
            errors.push(error);
        }
        const current = this.currentRecord?.scene;
        this.currentRecord = undefined;
        this.pausedScene = undefined;
        if (current) {
            try {
                destroyScene(current, "runtime-dispose");
            } catch (error) {
                errors.push(error);
            }
        }
        this.routes.clear();
        if (errors.length > 0) throw new SceneFlowCleanupError(errors);
    }

    async waitForPendingLoads(): Promise<void> {
        while (this.pending.size > 0) await Promise.allSettled([...this.pending]);
    }

    private async openRoute<TArgs>(
        route: SceneRoute<TArgs>,
        args: TArgs,
        options: SceneOpenOptions,
        requestId: number,
        signal: AbortSignal,
    ): Promise<BaseGameScene<TArgs>> {
        const showLoading = options.showLoading ?? true;
        const autoCloseLoading = options.autoCloseLoading ?? true;
        const hasLoading = showLoading && this.loadingPresenter !== undefined;
        const reporter = new TransitionProgressReporter(
            requestId,
            route.id,
            () => this.isCurrent(requestId, signal),
            (progress) => {
                this.progressValue = progress;
                if (hasLoading && this.loadingRequestId === requestId) {
                    this.loadingPresenter?.update(progress);
                }
                options.onProgress?.(progress);
            },
        );
        const oldRecord = this.currentRecord;
        let nextScene: BaseGameScene<TArgs> | undefined;
        let opened = false;
        let committed = false;
        let primaryError: unknown;
        let readyForLoadingClose = false;
        let manualLoadingCloseRequested = false;

        const requestLoadingClose = () => {
            manualLoadingCloseRequested = true;
            if (readyForLoadingClose && nextScene) {
                this.completeSceneLoading(requestId, nextScene);
            }
        };

        try {
            if (hasLoading) {
                this.loadingRequestId = requestId;
                await this.loadingPresenter?.show(reporter.current);
            } else if (!showLoading) {
                this.hideRetainedLoading();
            }
            this.assertCurrent(requestId, signal);

            reporter.emit("cleanup", 0);
            if (oldRecord) await this.pauseScene(oldRecord.scene, route.id);
            this.assertCurrent(requestId, signal);
            await this.releasePreviousScene(oldRecord);
            reporter.emit("cleanup", 1);
            this.assertCurrent(requestId, signal);

            reporter.emit("scene", 0);
            const prefab = await Laya.loader.load(route.url, {
                type: Laya.Loader.HIERARCHY,
            }, (progress) => reporter.emit("scene", progress)) as Laya.Prefab | null;
            this.assertCurrent(requestId, signal);
            reporter.emit("scene", 1);
            if (!(prefab instanceof Laya.Prefab)) {
                throw new Error(`Scene asset '${route.url}' did not load as a Prefab.`);
            }

            const creationErrors: unknown[] = [];
            const node = prefab.create(undefined, creationErrors);
            if (!(node instanceof BaseGameScene)) {
                node.destroy();
                throw new Error(`Scene route '${route.id}' root must extend BaseGameScene.`);
            }
            nextScene = node as BaseGameScene<TArgs>;
            if (hasLoading) nextScene.bindTransitionLoadingCompletion(requestLoadingClose);
            if (creationErrors.length > 0) {
                throw new SceneCreationError(route.id, creationErrors);
            }

            const resources = validateResources(nextScene.getTransitionResources(args));
            reporter.emit("resources", resources.length === 0 ? 1 : 0);
            if (resources.length > 0) {
                const results = await Laya.loader.load(
                    resources.map(toLoadURL),
                    undefined,
                    (progress) => reporter.emit("resources", progress),
                ) as unknown;
                this.assertCurrent(requestId, signal);
                validateResourceResults(resources, results);
                reporter.emit("resources", 1);
            }

            reporter.emit("prepare", 0);
            await nextScene.prepareForTransition(createPhaseContext(
                args, signal, (progress) => reporter.emit("prepare", progress),
            ));
            this.assertCurrent(requestId, signal);
            reporter.emit("prepare", 1);

            reporter.emit("switch", 0);
            nextScene.open(false, args);
            opened = true;
            await nextScene.waitUntilTransitionReady(createPhaseContext(
                args, signal, (progress) => reporter.emit("switch", progress),
            ));
            this.assertCurrent(requestId, signal);
            reporter.emit("switch", 1);

            this.currentRecord = {
                route: route as unknown as UnknownRoute,
                scene: nextScene as unknown as UnknownScene,
            };
            committed = true;
            reporter.emit("ready", 1);
            await this.waitForFrame();
            readyForLoadingClose = true;
            if (hasLoading && (autoCloseLoading || manualLoadingCloseRequested)) {
                this.completeSceneLoading(requestId, nextScene);
            }
            return nextScene;
        } catch (error) {
            primaryError = this.normalizeError(error, requestId, signal);
            const cleanupErrors: unknown[] = [];
            if (!committed && nextScene) {
                try {
                    destroyScene(nextScene, opened ? "transition-rollback" : "preparation-rollback");
                } catch (cleanupError) {
                    cleanupErrors.push(cleanupError);
                }
            }
            const oldSceneAvailable = !committed && this.ownsRequest(requestId) && oldRecord
                && this.currentRecord === oldRecord && !oldRecord.scene.destroyed;
            if (oldSceneAvailable) {
                try {
                    await this.resumeScene(oldRecord.scene);
                } catch (resumeError) {
                    cleanupErrors.push(resumeError);
                }
            }
            if (cleanupErrors.length > 0) {
                primaryError = new SceneTransitionFailureError(primaryError, cleanupErrors);
            }
            if (this.ownsRequest(requestId)) {
                this.lastErrorValue = errorMessage(primaryError);
                if (hasLoading) {
                    try {
                        if (oldSceneAvailable) this.hideLoading(requestId);
                        else this.failLoading(requestId, reporter.current, primaryError);
                    } catch (loadingError) {
                        primaryError = new SceneTransitionFailureError(primaryError, [loadingError]);
                        this.lastErrorValue = errorMessage(primaryError);
                    }
                }
            }
            throw primaryError;
        }
    }

    private async releasePreviousScene(oldRecord: SceneRecord | undefined): Promise<void> {
        let operation = this.releaseOperation;
        if (!operation && oldRecord && this.currentRecord === oldRecord) {
            this.currentRecord = undefined;
            if (this.pausedScene === oldRecord.scene) this.pausedScene = undefined;
            operation = this.releaseAndCollectScene(oldRecord.scene);
            this.releaseOperation = operation;
            const clear = () => {
                if (this.releaseOperation === operation) this.releaseOperation = undefined;
            };
            operation.then(clear, clear);
        }
        if (operation) await operation;
    }

    private async releaseAndCollectScene(scene: UnknownScene): Promise<void> {
        await leaveAndDestroyScene(scene, "scene-replaced");
        await this.waitForFrame();
        Laya.Scene.gc();
    }

    private completeSceneLoading(requestId: number, scene: UnknownScene): void {
        if (!this.ownsRequest(requestId) || this.currentRecord?.scene !== scene) return;
        this.hideLoading(requestId);
    }

    private hideLoading(requestId: number): void {
        if (this.loadingRequestId !== requestId) return;
        this.loadingPresenter?.hide();
        if (this.loadingRequestId === requestId) this.loadingRequestId = undefined;
    }

    private hideRetainedLoading(): void {
        if (this.loadingRequestId === undefined) return;
        this.loadingPresenter?.hide();
        this.loadingRequestId = undefined;
    }

    private failLoading(
        requestId: number, progress: SceneTransitionProgress, error: unknown,
    ): void {
        if (this.loadingRequestId !== requestId) return;
        this.loadingPresenter?.fail(progress, error);
    }

    private async pauseScene(scene: UnknownScene, nextRouteId: string): Promise<void> {
        if (this.pausedScene === scene || scene.destroyed) return;
        if (this.pauseOperation?.scene === scene) {
            await this.pauseOperation.promise;
            return;
        }
        const promise = scene.pauseForTransition({ nextRouteId }).then(() => {
            if (!scene.destroyed) this.pausedScene = scene;
        }).finally(() => {
            if (this.pauseOperation?.promise === promise) this.pauseOperation = undefined;
        });
        this.pauseOperation = { scene, promise };
        await promise;
    }

    private async resumeScene(scene: UnknownScene): Promise<void> {
        if (this.pausedScene !== scene || scene.destroyed) return;
        await scene.resumeAfterTransitionFailure();
        if (this.pausedScene === scene) this.pausedScene = undefined;
    }

    private normalizeError(error: unknown, requestId: number, signal: AbortSignal): unknown {
        if (!this.isCurrent(requestId, signal)) return new SceneTransitionCancelledError();
        return error;
    }

    private isCurrent(requestId: number, signal: AbortSignal): boolean {
        return this.ownsRequest(requestId) && !signal.aborted;
    }

    private ownsRequest(requestId: number): boolean {
        return this.stateValue !== "disposed" && this.requestVersion === requestId;
    }

    private assertCurrent(requestId: number, signal: AbortSignal): void {
        if (!this.isCurrent(requestId, signal)) throw new SceneTransitionCancelledError();
    }

    private requireRoute(routeId: string): UnknownRoute {
        const route = this.routes.get(routeId);
        if (!route) throw new Error(`Unknown scene route '${routeId}'.`);
        return route;
    }

    private requireActive(): void {
        if (this.stateValue === "disposed") throw new Error("SceneFlow has been disposed.");
    }
}

function destroyScene(scene: BaseGameScene<unknown>, reason: string): void {
    const errors: unknown[] = [];
    if (scene.parent && !scene.destroyed) {
        try {
            scene.close(reason);
        } catch (error) {
            errors.push(error);
        }
    }
    if (!scene.destroyed) {
        try {
            scene.destroy();
        } catch (error) {
            if (error instanceof SceneLifecycleCleanupError) errors.push(...error.errors);
            else errors.push(error);
        }
    }
    if (errors.length > 0) throw new SceneFlowCleanupError(errors);
}

async function leaveAndDestroyScene(scene: BaseGameScene<unknown>, reason: string): Promise<void> {
    const errors: unknown[] = [];
    try {
        await scene.leaveForTransition();
    } catch (error) {
        errors.push(error);
    }
    try {
        destroyScene(scene, reason);
    } catch (error) {
        if (error instanceof SceneFlowCleanupError) errors.push(...error.errors);
        else errors.push(error);
    }
    if (errors.length > 0) throw new SceneFlowCleanupError(errors);
}

function waitForNextFrame(): Promise<void> {
    return new Promise((resolve) => Laya.timer.frameOnce(1, null, resolve));
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
