import type {
    WorldCleanup, WorldContext, WorldRegistration, WorldRegistrySnapshot, WorldSnapshot,
} from "./WorldDefinition";

export type { WorldCleanup, WorldContext, WorldDefinition, WorldFactory, WorldRegistration, WorldRegistrySnapshot } from "./WorldDefinition";

export class WorldInitializationCancelledError extends Error {
    public constructor(public readonly worldId: string) {
        super(`World initialization was cancelled: ${worldId}`);
        this.name = "WorldInitializationCancelledError";
    }
}

export class WorldCleanupError extends Error {
    public constructor(public readonly worldIds: readonly string[], public readonly errors: readonly unknown[]) {
        super(`World cleanup failed (${worldIds.join(", ")}): ${errors.length} operation(s).`);
        this.name = "WorldCleanupError";
    }
}

export class WorldInitializationError extends Error {
    public constructor(public readonly worldId: string, public readonly cause: unknown, public readonly cleanupErrors: readonly unknown[]) {
        super(`World initialization and rollback failed: ${worldId}`);
        this.name = "WorldInitializationError";
    }
}

interface WorldRecord<TContext extends WorldContext> {
    context: TContext;
    readonly controller: AbortController;
    readonly cleanups: WorldCleanup[];
    readonly cleanupErrors: unknown[];
    readonly enterTask: Promise<TContext>;
    readonly resolveEnter: (context: TContext) => void;
    readonly rejectEnter: (error: unknown) => void;
    state: WorldSnapshot["state"];
    initializing: boolean;
    pendingCleanups: number;
    initializeTask: Promise<void>;
    cleanupTail: Promise<void>;
    exitTask?: Promise<void>;
}

/** 统一管理持有关系并等待未结束的工作；引擎绑定在组装时注入。 */
export class WorldRegistry<TContext extends WorldContext = WorldContext> {
    private readonly definitions = new Map<string, WorldRegistration<TContext>>();
    private readonly records = new Map<string, WorldRecord<TContext>>();
    private readonly unregistering = new Map<string, Promise<void>>();
    private readonly pending = new Set<Promise<void>>();
    private readonly failedRecords = new Set<WorldRecord<TContext>>();
    private disposed = false;
    private disposeTask?: Promise<void>;

    public constructor(
        private readonly createContext?: (context: WorldContext) => TContext,
        private readonly canEnter?: () => boolean,
    ) {
    }

    public register(definition: WorldRegistration<TContext>): void {
        if (this.disposed) {
            throw new Error("WorldRegistry is disposed.");
        }
        if (!definition.id.trim()) {
            throw new Error("World id must not be empty.");
        }
        if (this.definitions.has(definition.id)) {
            throw new Error(`World is already registered: ${definition.id}`);
        }
        this.definitions.set(definition.id, definition);
    }

    public enter(id: string): Promise<TContext> {
        if (this.disposed) {
            return Promise.reject(new Error("WorldRegistry is disposed."));
        }
        if (this.canEnter && !this.canEnter()) {
            return Promise.reject(new Error("Framework World is not ready."));
        }
        const definition = this.definitions.get(id);
        if (!definition) {
            return Promise.reject(new Error(`World is not registered: ${id}`));
        }
        if (this.unregistering.has(id)) {
            return Promise.reject(new Error(`World is being unregistered: ${id}`));
        }
        const existing = this.records.get(id);
        if (existing) {
            if (existing.state === "active" || existing.state === "initializing") {
                return existing.enterTask;
            }
            return Promise.reject(new Error(`World has not finished unloading: ${id}`));
        }
        const record = this.createRecord(id);
        this.records.set(id, record);
        record.initializeTask = this.track(Promise.resolve().then(() => {
            if (!record.controller.signal.aborted) {
                record.context = this.createContext?.(record.context) ?? record.context;
                const world = "create" in definition ? definition.create() : definition;
                if (world.id !== id) {
                    throw new Error("World factory returned a different id: " + id);
                }
                return world.initialize(record.context);
            }
        }).then(() => {
            record.initializing = false;
            if (record.state !== "initializing") {
                return;
            }
            record.state = "active";
            record.resolveEnter(record.context);
        }, (error: unknown) => {
            record.initializing = false;
            const exiting = this.beginExit(record, false);
            void exiting.then(() => record.rejectEnter(error), () => {
                record.rejectEnter(new WorldInitializationError(id, error, [...record.cleanupErrors]));
            });
        }));
        return record.enterTask;
    }

    /** 只有完全初始化且仍有效的作用域才对调用方开放。 */
    public get(id: string): TContext | undefined {
        const record = this.records.get(id);
        return record?.state === "active" ? record.context : undefined;
    }

    public exit(id: string): Promise<void> {
        const record = this.records.get(id);
        return record ? this.beginExit(record, true) : Promise.resolve();
    }

    /** 传入定义对象，防止旧持有者误注销使用相同 id 的新定义。 */
    public unregister(definitionOrId: WorldRegistration<TContext> | string): Promise<void> {
        const id = typeof definitionOrId === "string" ? definitionOrId : definitionOrId.id;
        const definition = this.definitions.get(id);
        if (!definition || (typeof definitionOrId !== "string" && definition !== definitionOrId)) {
            return Promise.resolve();
        }
        const existing = this.unregistering.get(id);
        if (existing) {
            return existing;
        }
        let exitTask: Promise<void>;
        const task = this.track(Promise.resolve().then(() => exitTask).then(() => {
            if (this.definitions.get(id) === definition) {
                this.definitions.delete(id);
            }
        }));
        this.unregistering.set(id, task);
        void task.then(() => this.unregistering.delete(id), () => this.unregistering.delete(id));
        exitTask = this.exit(id);
        return task;
    }

    public dispose(): Promise<void> {
        if (this.disposeTask) {
            return this.disposeTask;
        }
        this.disposed = true;
        let exits: Promise<void>[];
        this.disposeTask = Promise.resolve().then(async () => {
            await Promise.allSettled(exits);
            this.definitions.clear();
            await this.waitForPendingLoads();
        });
        // 内部调用方可以先使其失效，再等待清理完成。
        void this.disposeTask.catch(() => {
        });
        exits = [...this.records.values()].map((record) => this.beginExit(record, true));
        return this.disposeTask;
    }

    /** 等待原始初始化工作，以及取消后才追加的清理操作。 */
    public async waitForPendingLoads(): Promise<void> {
        while (this.pending.size > 0) {
            await Promise.allSettled([...this.pending]);
        }
        this.throwCleanupFailures();
    }

    public snapshot(): WorldRegistrySnapshot {
        const records = new Set([...this.records.values(), ...this.failedRecords]);
        return {
            registered: [...this.definitions.keys()],
            worlds: [...records].map((record) => ({
                id: record.context.id,
                state: record.state,
                pendingInitialization: record.initializing,
                pendingCleanups: record.pendingCleanups,
                cleanupFailures: record.cleanupErrors.length,
            })),
            pendingLoads: this.pending.size,
            cleanupFailures: [...this.failedRecords].reduce((count, record) => count + record.cleanupErrors.length, 0),
        };
    }

    private createRecord(id: string): WorldRecord<TContext> {
        const controller = new AbortController();
        let resolveEnter!: (context: TContext) => void;
        let rejectEnter!: (error: unknown) => void;
        const enterTask = new Promise<TContext>((resolve, reject) => {
            resolveEnter = resolve;
            rejectEnter = reject;
        });
        void enterTask.catch(() => {
        });
        const record: WorldRecord<TContext> = {
            context: Object.freeze({ id, signal: controller.signal, own: (cleanup: WorldCleanup) => this.own(record, cleanup) }) as TContext,
            controller, cleanups: [], cleanupErrors: [], enterTask, resolveEnter, rejectEnter,
            state: "initializing", initializing: true, pendingCleanups: 0,
            initializeTask: Promise.resolve(), cleanupTail: Promise.resolve(),
        };
        return record;
    }

    private own(record: WorldRecord<TContext>, cleanup: WorldCleanup): void {
        if (record.controller.signal.aborted) {
            this.queueCleanup(record, cleanup);
        } else {
            record.cleanups.push(cleanup);
        }
    }

    private beginExit(record: WorldRecord<TContext>, cancelEnter: boolean): Promise<void> {
        if (record.exitTask) {
            return record.exitTask;
        }
        const wasInitializing = record.state === "initializing";
        record.state = "exiting";
        // 先保存共享任务，避免取消监听器重入 exit() 时重复退出。
        record.exitTask = this.track(Promise.resolve().then(async () => {
            await record.initializeTask;
            let tail: Promise<void>;
            do {
                tail = record.cleanupTail;
                await tail;
            } while (tail !== record.cleanupTail);
            if (record.cleanupErrors.length > 0) {
                record.state = "cleanup-failed";
                throw new WorldCleanupError([record.context.id], [...record.cleanupErrors]);
            }
            if (this.records.get(record.context.id) === record) {
                this.records.delete(record.context.id);
            }
        }));
        // 清理流程独立于原始初始化 Promise 执行，因为清理可能解除初始化的等待。
        record.controller.abort();
        if (wasInitializing && cancelEnter) {
            record.rejectEnter(new WorldInitializationCancelledError(record.context.id));
        }
        for (const cleanup of record.cleanups.splice(0).reverse()) {
            this.queueCleanup(record, cleanup);
        }
        return record.exitTask;
    }

    private queueCleanup(record: WorldRecord<TContext>, cleanup: WorldCleanup): void {
        record.pendingCleanups += 1;
        record.cleanupTail = this.track(record.cleanupTail.then(cleanup).then(() => {
            record.pendingCleanups -= 1;
        }, (error: unknown) => {
            record.pendingCleanups -= 1;
            record.cleanupErrors.push(error);
            record.state = "cleanup-failed";
            this.failedRecords.add(record);
        }));
    }

    private track(task: Promise<void>): Promise<void> {
        this.pending.add(task);
        void task.then(() => this.pending.delete(task), () => this.pending.delete(task));
        return task;
    }

    private throwCleanupFailures(): void {
        if (this.failedRecords.size === 0) {
            return;
        }
        throw new WorldCleanupError(
            [...this.failedRecords].map((record) => record.context.id),
            [...this.failedRecords].flatMap((record) => record.cleanupErrors),
        );
    }
}
