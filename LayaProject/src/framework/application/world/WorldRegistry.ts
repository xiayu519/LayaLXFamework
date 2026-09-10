import type {
    WorldCleanup, WorldContext, WorldDefinition, WorldRegistrySnapshot, WorldSnapshot,
} from "./WorldDefinition";

export type { WorldCleanup, WorldContext, WorldDefinition, WorldRegistrySnapshot } from "./WorldDefinition";

export class WorldInitializationCancelledError extends Error {
    constructor(readonly worldId: string) {
        super(`World initialization was cancelled: ${worldId}`);
        this.name = "WorldInitializationCancelledError";
    }
}

export class WorldCleanupError extends Error {
    constructor(readonly worldIds: readonly string[], readonly errors: readonly unknown[]) {
        super(`World cleanup failed (${worldIds.join(", ")}): ${errors.length} operation(s).`);
        this.name = "WorldCleanupError";
    }
}

export class WorldInitializationError extends Error {
    constructor(readonly worldId: string, readonly cause: unknown, readonly cleanupErrors: readonly unknown[]) {
        super(`World initialization and rollback failed: ${worldId}`);
        this.name = "WorldInitializationError";
    }
}

interface WorldRecord {
    readonly context: WorldContext;
    readonly controller: AbortController;
    readonly cleanups: WorldCleanup[];
    readonly cleanupErrors: unknown[];
    readonly enterTask: Promise<WorldContext>;
    readonly resolveEnter: (context: WorldContext) => void;
    readonly rejectEnter: (error: unknown) => void;
    state: WorldSnapshot["state"];
    initializing: boolean;
    pendingCleanups: number;
    initializeTask: Promise<void>;
    cleanupTail: Promise<void>;
    exitTask?: Promise<void>;
}

/** Coordinates module registration lifetimes without owning engine or presentation objects. */
export class WorldRegistry {
    private readonly definitions = new Map<string, WorldDefinition>();
    private readonly records = new Map<string, WorldRecord>();
    private readonly unregistering = new Map<string, Promise<void>>();
    private readonly pending = new Set<Promise<void>>();
    private readonly failedRecords = new Set<WorldRecord>();
    private disposed = false;
    private disposeTask?: Promise<void>;

    register(definition: WorldDefinition): void {
        if (this.disposed) throw new Error("WorldRegistry is disposed.");
        if (!definition.id.trim()) throw new Error("World id must not be empty.");
        if (this.definitions.has(definition.id)) throw new Error(`World is already registered: ${definition.id}`);
        this.definitions.set(definition.id, definition);
    }

    enter(id: string): Promise<WorldContext> {
        if (this.disposed) return Promise.reject(new Error("WorldRegistry is disposed."));
        const definition = this.definitions.get(id);
        if (!definition) return Promise.reject(new Error(`World is not registered: ${id}`));
        if (this.unregistering.has(id)) return Promise.reject(new Error(`World is being unregistered: ${id}`));
        const existing = this.records.get(id);
        if (existing) {
            if (existing.state === "active" || existing.state === "initializing") return existing.enterTask;
            return Promise.reject(new Error(`World has not finished unloading: ${id}`));
        }
        const record = this.createRecord(id);
        this.records.set(id, record);
        record.initializeTask = this.track(Promise.resolve().then(() => {
            if (!record.controller.signal.aborted) return definition.initialize(record.context);
        }).then(() => {
            record.initializing = false;
            if (record.state !== "initializing") return;
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

    /** Only a fully initialized, live scope is available to callers. */
    get(id: string): WorldContext | undefined {
        const record = this.records.get(id);
        return record?.state === "active" ? record.context : undefined;
    }

    exit(id: string): Promise<void> {
        const record = this.records.get(id);
        return record ? this.beginExit(record, true) : Promise.resolve();
    }

    /** Passing a definition protects against an old owner unregistering a replacement with the same id. */
    unregister(definitionOrId: WorldDefinition | string): Promise<void> {
        const id = typeof definitionOrId === "string" ? definitionOrId : definitionOrId.id;
        const definition = this.definitions.get(id);
        if (!definition || (typeof definitionOrId !== "string" && definition !== definitionOrId)) return Promise.resolve();
        const existing = this.unregistering.get(id);
        if (existing) return existing;
        let exitTask: Promise<void>;
        const task = this.track(Promise.resolve().then(() => exitTask).then(() => {
            if (this.definitions.get(id) === definition) this.definitions.delete(id);
        }));
        this.unregistering.set(id, task);
        void task.then(() => this.unregistering.delete(id), () => this.unregistering.delete(id));
        exitTask = this.exit(id);
        return task;
    }

    dispose(): Promise<void> {
        if (this.disposeTask) return this.disposeTask;
        this.disposed = true;
        let exits: Promise<void>[];
        this.disposeTask = Promise.resolve().then(async () => {
            await Promise.allSettled(exits);
            this.definitions.clear();
            await this.waitForPendingLoads();
        });
        // Internal callers may invalidate first and observe completion later.
        void this.disposeTask.catch(() => {});
        exits = [...this.records.values()].map((record) => this.beginExit(record, true));
        return this.disposeTask;
    }

    /** Drain original initialize work as well as cleanup added after cancellation. */
    async waitForPendingLoads(): Promise<void> {
        while (this.pending.size > 0) await Promise.allSettled([...this.pending]);
        this.throwCleanupFailures();
    }

    snapshot(): WorldRegistrySnapshot {
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

    private createRecord(id: string): WorldRecord {
        const controller = new AbortController();
        let resolveEnter!: (context: WorldContext) => void;
        let rejectEnter!: (error: unknown) => void;
        const enterTask = new Promise<WorldContext>((resolve, reject) => {
            resolveEnter = resolve;
            rejectEnter = reject;
        });
        void enterTask.catch(() => {});
        const record: WorldRecord = {
            context: Object.freeze({ id, signal: controller.signal, own: (cleanup: WorldCleanup) => this.own(record, cleanup) }),
            controller, cleanups: [], cleanupErrors: [], enterTask, resolveEnter, rejectEnter,
            state: "initializing", initializing: true, pendingCleanups: 0,
            initializeTask: Promise.resolve(), cleanupTail: Promise.resolve(),
        };
        return record;
    }

    private own(record: WorldRecord, cleanup: WorldCleanup): void {
        if (record.controller.signal.aborted) this.queueCleanup(record, cleanup);
        else record.cleanups.push(cleanup);
    }

    private beginExit(record: WorldRecord, cancelEnter: boolean): Promise<void> {
        if (record.exitTask) return record.exitTask;
        const wasInitializing = record.state === "initializing";
        record.state = "exiting";
        // Publish the task before abort listeners can reenter exit().
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
            if (this.records.get(record.context.id) === record) this.records.delete(record.context.id);
        }));
        // Teardown runs independently of the original initialize promise; it may unblock that promise.
        record.controller.abort();
        if (wasInitializing && cancelEnter) record.rejectEnter(new WorldInitializationCancelledError(record.context.id));
        for (const cleanup of record.cleanups.splice(0).reverse()) this.queueCleanup(record, cleanup);
        return record.exitTask;
    }

    private queueCleanup(record: WorldRecord, cleanup: WorldCleanup): void {
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
        if (this.failedRecords.size === 0) return;
        throw new WorldCleanupError(
            [...this.failedRecords].map((record) => record.context.id),
            [...this.failedRecords].flatMap((record) => record.cleanupErrors),
        );
    }
}
