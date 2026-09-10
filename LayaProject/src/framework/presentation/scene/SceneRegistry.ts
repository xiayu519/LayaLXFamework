import {
    SceneFlow, SceneFlowCleanupError, SceneTransitionCancelledError, SceneTransitionFailureError,
    type SceneRoute, type SceneOpenOptions, type SceneFlowOptions,
    type SceneLoadingPresenter, type SceneTransitionProgress,
} from "./SceneFlow";
import type { BaseGameScene } from "./BaseGameScene";

interface SceneRegistration {
    readonly route: SceneRoute<unknown>;
    readonly scenes: Set<BaseGameScene<unknown>>;
    version: number;
    flow?: SceneFlow;
    closing?: Promise<void>;
    unregistering?: Promise<void>;
    retiring: boolean;
    failure?: SceneRegistryCleanupError;
}

export class SceneRegistryCleanupError extends Error {
    constructor(readonly errors: readonly unknown[]) {
        super(`${errors.length} scene registry cleanup operation(s) failed.`);
        this.name = "SceneRegistryCleanupError";
    }
}

/** Owns native scenes; independent route registrations have independent transition lifetimes. */
export class SceneRegistry {
    private readonly entries = new Map<string, SceneRegistration>();
    private readonly pending = new Set<Promise<unknown>>();
    private readonly loading = new Map<SceneRegistration, SceneTransitionProgress>();
    private loadingTask: Promise<void> | undefined;
    private disposeTask: Promise<void> | undefined;
    private disposed = false;

    constructor(private readonly options: SceneFlowOptions = {}) {}

    register<TArgs>(route: SceneRoute<TArgs>): SceneRoute<TArgs> {
        this.requireActive();
        if (!route.id.trim() || !route.url.trim() || this.entries.has(route.id)) {
            throw new Error(`Duplicate or invalid scene route '${route.id}'.`);
        }
        this.entries.set(route.id, { route, scenes: new Set(), version: 0, retiring: false });
        return route;
    }

    get<TArgs>(route: SceneRoute<TArgs>): BaseGameScene<TArgs> | undefined;
    get(route: string): BaseGameScene<unknown> | undefined;
    get(route: string | SceneRoute<unknown>): BaseGameScene<unknown> | undefined {
        const entry = this.entries.get(typeof route === "string" ? route : route.id);
        if (!entry || entry.retiring || entry.closing || entry.failure || this.disposed) return undefined;
        if (typeof route !== "string" && entry.route !== route) return undefined;
        const scene = entry.flow?.current;
        return scene && !scene.destroyed ? scene : undefined;
    }

    open<TArgs>(route: SceneRoute<TArgs>, args: NoInfer<TArgs>, options?: SceneOpenOptions): Promise<BaseGameScene<TArgs>>;
    open<TArgs>(route: string, args: TArgs, options?: SceneOpenOptions): Promise<BaseGameScene<TArgs>>;
    open<TArgs>(route: string | SceneRoute<TArgs>, args: TArgs, options: SceneOpenOptions = {}): Promise<BaseGameScene<TArgs>> {
        const entry = this.requireEntry(route);
        const version = entry.version;
        return this.track((async () => {
            await entry.closing;
            this.assertOpen(entry, version, options);
            if (!entry.flow) entry.flow = this.createFlow(entry);
            let scene: BaseGameScene<TArgs>;
            try {
                scene = await entry.flow.open(entry.route.id, args, options);
                this.assertOpen(entry, version, options);
                if (scene.destroyed) throw new SceneTransitionCancelledError();
            } catch (error) {
                if (error instanceof SceneFlowCleanupError || error instanceof SceneTransitionFailureError) {
                    entry.failure = new SceneRegistryCleanupError([error]);
                }
                try { await this.drainScenes(entry, false); }
                catch (cleanupError) { throw new SceneRegistryCleanupError([error, cleanupError]); }
                throw error;
            }
            await this.drainScenes(entry, false);
            this.assertOpen(entry, version, options);
            if (scene.destroyed || entry.flow?.current !== scene) throw new SceneTransitionCancelledError();
            return scene;
        })());
    }

    /** Cancel queued opens and unload this instance, retaining its definition. */
    close(route: string | SceneRoute<unknown>): Promise<void> {
        return this.closeEntry(this.requireEntry(route));
    }

    /** Revoke new opens immediately; stale definition objects cannot remove a replacement. */
    unregister(route: string | SceneRoute<unknown>): Promise<void> {
        const id = typeof route === "string" ? route : route.id;
        const entry = this.entries.get(id);
        if (!entry || typeof route !== "string" && entry.route !== route) return Promise.resolve();
        if (entry.unregistering) return entry.unregistering;
        entry.retiring = true;
        let close: Promise<void>;
        entry.unregistering = this.track(Promise.resolve().then(() => close).then(() => {
            if (this.entries.get(id) === entry) this.entries.delete(id);
        }));
        close = this.closeEntry(entry);
        return entry.unregistering;
    }

    dispose(): Promise<void> {
        if (this.disposeTask) return this.disposeTask;
        this.disposed = true;
        let exits: Promise<void>[];
        this.disposeTask = Promise.resolve().then(async () => {
            await Promise.allSettled(exits);
            await this.waitForPendingLoads();
        });
        void this.disposeTask.catch(() => {});
        exits = [...this.entries.values()].map(entry => this.unregister(entry.route));
        return this.disposeTask;
    }

    async waitForPendingLoads(): Promise<void> {
        do {
            while (this.pending.size) await Promise.allSettled([...this.pending]);
            await Promise.all([...this.entries.values()].map(async entry => {
                try { await entry.flow?.waitForPendingLoads(); }
                catch (error) { entry.failure ??= new SceneRegistryCleanupError([error]); }
            }));
        } while (this.pending.size);
        const failures = [...this.entries.values()].flatMap(entry => entry.failure ? [entry.failure] : []);
        if (failures.length) throw new SceneRegistryCleanupError(failures);
    }

    snapshot() {
        return {
            disposed: this.disposed, registeredRoutes: [...this.entries.keys()], pendingTransitions: this.pending.size,
            cleanupFailures: [...this.entries.values()].filter(entry => entry.failure !== undefined).length,
            scenes: [...this.entries.values()].map(entry => ({
                routeId: entry.route.id, unloading: entry.retiring || !!entry.closing,
                loaded: !!entry.flow?.current && !entry.flow.current.destroyed, flow: entry.flow?.snapshot(),
            })),
        };
    }

    private createFlow(entry: SceneRegistration): SceneFlow {
        const flow = new SceneFlow({
            ...this.options,
            loadingPresenter: this.presenterFor(entry),
            collectGarbage: () => this.collect(entry),
            configureScene: scene => {
                // Retain pending and rolled-back scenes until their native UI work has drained.
                entry.scenes.add(scene);
                this.options.configureScene?.(scene);
            },
        });
        flow.register(entry.route);
        return flow;
    }

    private closeEntry(entry: SceneRegistration): Promise<void> {
        entry.version += 1;
        if (entry.closing) return entry.closing;
        if (entry.failure && (!entry.flow || entry.flow.snapshot().state === "disposed")) return Promise.reject(entry.failure);
        const flow = entry.flow;
        const errors: unknown[] = entry.failure ? [entry.failure] : [];
        // Publish before synchronous disposal/abort callbacks can reenter this registration.
        entry.closing = this.track(Promise.resolve().then(async () => {
            try { await flow?.waitForPendingLoads(); } catch (error) { errors.push(error); }
            try { await this.drainScenes(entry, true); } catch (error) { errors.push(error); }
            if (errors.length) throw new SceneRegistryCleanupError(errors);
            if (flow) {
                await (this.options.waitForFrame?.() ?? new Promise<void>(resolve => Laya.timer.frameOnce(1, null, resolve)));
                this.collect(entry);
            }
            entry.flow = undefined;
        }).catch((error: unknown) => {
            const failure = error instanceof SceneRegistryCleanupError ? error : new SceneRegistryCleanupError([error]);
            entry.failure = failure;
            throw failure;
        }));
        const closing = entry.closing;
        void closing.then(() => { if (entry.closing === closing) entry.closing = undefined; },
            () => { if (entry.closing === closing) entry.closing = undefined; });
        try { flow?.dispose(); } catch (error) { errors.push(error); }
        try { this.hideLoading(entry); } catch (error) { errors.push(error); }
        return closing;
    }

    private async drainScenes(entry: SceneRegistration, all: boolean): Promise<void> {
        const scenes = [...entry.scenes].filter(scene => all || scene.destroyed);
        const outcomes = await Promise.allSettled(scenes.map(async scene => {
            await scene.waitForUI();
            if (scene.destroyed) entry.scenes.delete(scene);
        }));
        const errors = outcomes.flatMap(outcome => outcome.status === "rejected" ? [outcome.reason] : []);
        if (errors.length) {
            entry.failure = new SceneRegistryCleanupError(errors);
            throw entry.failure;
        }
    }

    private collect(owner: SceneRegistration): void {
        // Runtime stop collects globally. A local close never waits for or collects during a sibling transition.
        if (this.disposed || [...this.entries.values()].some(entry => entry.failure
            || entry !== owner && (entry.closing || entry.flow?.snapshot().pendingTransitions))) return;
        try {
            if (this.options.collectGarbage) this.options.collectGarbage();
            else Laya.Scene.gc();
        } catch (error) {
            owner.failure = new SceneRegistryCleanupError([error]);
            throw error;
        }
    }

    private presenterFor(entry: SceneRegistration): SceneLoadingPresenter | undefined {
        const presenter = this.options.loadingPresenter;
        if (!presenter) return undefined;
        return {
            show: async progress => {
                this.loading.delete(entry);
                this.loading.set(entry, progress);
                // Keep the settled task for the whole shared presentation, so concurrent scenes do not show it twice.
                if (!this.loadingTask) {
                    const task: Promise<void> = Promise.resolve().then(() => {
                        if (this.loadingTask === task && this.loading.size > 0) return presenter.show(progress);
                    });
                    this.loadingTask = task;
                    void task.catch(() => { if (this.loadingTask === task) this.loadingTask = undefined; });
                }
                const task = this.loadingTask;
                await task;
                const front = this.loadingFront();
                if (this.loadingTask === task && front?.entry === entry) presenter.update(front.progress);
            },
            update: progress => {
                if (!this.loading.has(entry)) return;
                this.loading.set(entry, progress);
                if (this.loadingFront()?.entry === entry) presenter.update(progress);
            },
            fail: (progress, error) => { if (this.loadingFront()?.entry === entry) presenter.fail(progress, error); },
            hide: () => this.hideLoading(entry),
        };
    }

    private loadingFront(): { entry: SceneRegistration; progress: SceneTransitionProgress } | undefined {
        let latest: { entry: SceneRegistration; progress: SceneTransitionProgress } | undefined;
        for (const [entry, progress] of this.loading) latest = { entry, progress };
        return latest;
    }

    private hideLoading(entry: SceneRegistration): void {
        if (!this.loading.delete(entry)) return;
        const latest = this.loadingFront();
        if (latest) this.options.loadingPresenter?.update(latest.progress);
        else {
            this.loadingTask = undefined;
            this.options.loadingPresenter?.hide();
        }
    }

    private assertOpen(entry: SceneRegistration, version: number, options: SceneOpenOptions): void {
        if (this.disposed || entry.retiring || entry.version !== version || options.signal?.aborted
            || this.entries.get(entry.route.id) !== entry) throw new SceneTransitionCancelledError();
        if (entry.failure) throw entry.failure;
    }

    private requireEntry(route: string | SceneRoute<unknown>): SceneRegistration {
        this.requireActive();
        const id = typeof route === "string" ? route : route.id;
        const entry = this.entries.get(id);
        if (!entry || entry.retiring || typeof route !== "string" && route !== entry.route) {
            throw new Error(`Unknown or unloading scene '${id}'.`);
        }
        return entry;
    }

    private requireActive(): void { if (this.disposed) throw new Error("Scene registry has been disposed."); }
    private track<T>(operation: Promise<T>): Promise<T> {
        this.pending.add(operation);
        void operation.then(() => this.pending.delete(operation), () => this.pending.delete(operation));
        return operation;
    }
}
