export interface PrefabPoolDefinition<TNode extends Laya.Node = Laya.Node> {
    readonly id: string;
    readonly url: string;
    readonly maxIdle: number;
    readonly maxActive?: number;
    create?(prefab: Laya.Prefab): TNode;
    onAcquire?(node: TNode): void;
    onRelease?(node: TNode): void;
}

export interface PrefabPoolSnapshot {
    readonly id: string;
    readonly active: number;
    readonly pending: number;
    readonly idle: number;
    readonly loading: boolean;
    readonly cleanupFailures: number;
}

export interface PrefabPoolCleanupDiagnostic {
    readonly poolId: string;
    readonly nodeName: string;
    readonly attempts: number;
    /** False means native destroy already set destroyed before throwing; retry cannot prove recovery. */
    readonly retryable: boolean;
    readonly error: unknown;
}

export class PrefabPoolCleanupError extends Error {
    constructor(readonly errors: readonly unknown[]) {
        super(`${errors.length} prefab pool operation(s) failed to clean up.`);
        this.name = "PrefabPoolCleanupError";
    }
}

interface PoolRecord {
    readonly definition: PrefabPoolDefinition;
    readonly sign: string;
    readonly active: Set<Laya.Node>;
    readonly cleanupFailures: Map<Laya.Node, PrefabPoolCleanupDiagnostic>;
    pendingAcquires: number;
    loading?: Promise<Laya.Prefab>;
}

interface NodeOwnership {
    readonly poolId: string;
    active: boolean;
}

let serviceSequence = 0;

export class PrefabPoolService {
    private readonly pools = new Map<string, PoolRecord>();
    private readonly ownership = new WeakMap<Laya.Node, NodeOwnership>();
    private readonly pendingLoads = new Set<Promise<unknown>>();
    private readonly serviceId = ++serviceSequence;
    private disposed = false;
    private disposing = false;

    register<TNode extends Laya.Node>(definition: PrefabPoolDefinition<TNode>): void {
        this.requireActive();
        if (!definition.id || !definition.url) {
            throw new Error("Prefab pool id and url are required.");
        }
        if (!Number.isInteger(definition.maxIdle) || definition.maxIdle < 0) {
            throw new Error("Prefab pool maxIdle must be a non-negative integer.");
        }
        if (definition.maxActive !== undefined
            && (!Number.isInteger(definition.maxActive) || definition.maxActive < 1)) {
            throw new Error("Prefab pool maxActive must be a positive integer.");
        }
        if (this.pools.has(definition.id)) {
            throw new Error(`Duplicate prefab pool '${definition.id}'.`);
        }
        this.pools.set(definition.id, {
            definition: definition as PrefabPoolDefinition,
            sign: `lx.prefab:${this.serviceId}:${definition.id}`,
            active: new Set<Laya.Node>(),
            cleanupFailures: new Map(),
            pendingAcquires: 0,
        });
    }

    async acquire<TNode extends Laya.Node>(id: string): Promise<TNode> {
        this.requireActive();
        const pool = this.requirePool(id);
        const limit = pool.definition.maxActive;
        if (limit !== undefined && pool.active.size + pool.pendingAcquires >= limit) {
            throw new Error(`Prefab pool '${id}' reached maxActive ${limit}.`);
        }
        pool.pendingAcquires += 1;
        try {
            let node = this.takeIdle(pool);
            if (!node) {
                const prefab = await this.loadPrefab(pool);
                this.requireActive();
                const created: unknown = pool.definition.create?.(prefab) ?? prefab.create();
                if (!(created instanceof Laya.Node)) {
                    throw new Error(`Prefab pool '${id}' factory must create a Laya.Node.`);
                }
                node = created;
                this.ownership.set(node, { poolId: id, active: false });
            }

            const owner = this.ownership.get(node);
            if (!owner || owner.poolId !== id || owner.active) {
                node.destroy();
                throw new Error(`Prefab pool '${id}' detected invalid node ownership.`);
            }
            owner.active = true;
            pool.active.add(node);
            try {
                node.active = true;
                pool.definition.onAcquire?.(node);
                this.requireActive();
                if (node.destroyed) throw new Error(`Prefab pool '${id}' onAcquire destroyed its node.`);
            } catch (error) {
                pool.active.delete(node);
                owner.active = false;
                this.destroyNode(pool, node);
                this.throwCleanupErrors(pool, [error]);
                throw error;
            }
            return node as TNode;
        } finally {
            pool.pendingAcquires -= 1;
        }
    }

    release(id: string, node: Laya.Node): void {
        this.requireActive();
        const pool = this.requirePool(id);
        const owner = this.ownership.get(node);
        if (!owner || owner.poolId !== id) {
            throw new Error(`Node does not belong to prefab pool '${id}'.`);
        }
        if (!owner.active || !pool.active.delete(node)) {
            throw new Error(`Node was already released to prefab pool '${id}'.`);
        }
        owner.active = false;
        if (node.destroyed) {
            return;
        }
        try {
            node.removeSelf();
            pool.definition.onRelease?.(node);
            node.active = false;
        } catch (error) {
            this.destroyNode(pool, node);
            this.throwCleanupErrors(pool, [error]);
            throw error;
        }
        if (this.disposed || node.destroyed || Laya.Pool.getPoolBySign(pool.sign).length >= pool.definition.maxIdle) {
            this.destroyNode(pool, node);
            this.throwCleanupErrors(pool);
            return;
        }
        Laya.Pool.recover(pool.sign, node);
    }

    drain(id: string): void {
        this.requireActive();
        const pool = this.requirePool(id);
        if (pool.active.size > 0 || pool.pendingAcquires > 0) {
            throw new Error(
                `Cannot drain prefab pool '${id}' with ${pool.active.size} active and `
                + `${pool.pendingAcquires} pending node(s).`,
            );
        }
        this.retryCleanup(pool);
        this.destroyIdle(pool);
        this.throwCleanupErrors(pool);
    }

    snapshot(): readonly PrefabPoolSnapshot[] {
        return Array.from(this.pools.values())
            .map((pool) => Object.freeze({
                id: pool.definition.id,
                active: pool.active.size,
                pending: pool.pendingAcquires,
                idle: Laya.Pool.getPoolBySign(pool.sign).length,
                loading: pool.loading !== undefined,
                cleanupFailures: pool.cleanupFailures.size,
            }))
            .sort((left, right) => left.id.localeCompare(right.id));
    }

    cleanupDiagnostics(): readonly PrefabPoolCleanupDiagnostic[] {
        return Array.from(this.pools.values()).flatMap((pool) => Array.from(pool.cleanupFailures.values()));
    }

    async waitForPendingLoads(): Promise<void> {
        while (this.pendingLoads.size > 0) {
            await Promise.allSettled(Array.from(this.pendingLoads));
        }
    }

    dispose(): void {
        if (this.disposing) return;
        this.disposed = true;
        this.disposing = true;
        try {
            for (const pool of this.pools.values()) {
                this.retryCleanup(pool);
                for (const node of Array.from(pool.active)) {
                    this.destroyNode(pool, node);
                    const owner = this.ownership.get(node);
                    if (owner) owner.active = false;
                }
                pool.active.clear();
                this.destroyIdle(pool);
                if (pool.cleanupFailures.size === 0) this.pools.delete(pool.definition.id);
            }
            const errors = this.cleanupDiagnostics().map((diagnostic) => diagnostic.error);
            if (errors.length > 0) throw new PrefabPoolCleanupError(errors);
        } finally {
            this.disposing = false;
        }
    }

    private takeIdle(pool: PoolRecord): Laya.Node | undefined {
        let node = Laya.Pool.getItem(pool.sign) as Laya.Node | null;
        while (node?.destroyed) {
            node = Laya.Pool.getItem(pool.sign) as Laya.Node | null;
        }
        return node ?? undefined;
    }

    private loadPrefab(pool: PoolRecord): Promise<Laya.Prefab> {
        if (pool.loading) {
            return pool.loading;
        }
        const operation = (Laya.loader.load(pool.definition.url, {
            type: Laya.Loader.HIERARCHY,
        }) as Promise<Laya.Prefab | null>).then((prefab) => {
            if (!prefab) {
                throw new Error(`Prefab pool asset '${pool.definition.url}' did not load as a Prefab.`);
            }
            return prefab;
        });
        pool.loading = operation;
        this.pendingLoads.add(operation);
        operation.finally(() => {
            this.pendingLoads.delete(operation);
            if (pool.loading === operation) {
                pool.loading = undefined;
            }
        }).catch(() => {});
        return operation;
    }

    private destroyIdle(pool: PoolRecord): void {
        let node = Laya.Pool.getItem(pool.sign) as Laya.Node | null;
        while (node) {
            this.destroyNode(pool, node);
            node = Laya.Pool.getItem(pool.sign) as Laya.Node | null;
        }
        Laya.Pool.clearBySign(pool.sign);
    }

    private retryCleanup(pool: PoolRecord): void {
        for (const [node, diagnostic] of Array.from(pool.cleanupFailures)) {
            if (diagnostic.retryable) this.destroyNode(pool, node);
        }
    }

    private destroyNode(pool: PoolRecord, node: Laya.Node): void {
        const previous = pool.cleanupFailures.get(node);
        if (previous && !previous.retryable) return;
        try {
            if (node.destroyed && previous) {
                throw new Error("Node became destroyed after an incomplete cleanup; recovery cannot be verified.");
            }
            if (!node.destroyed) node.destroy();
            if (!node.destroyed) throw new Error("Node.destroy() returned without destroying the node.");
            pool.cleanupFailures.delete(node);
        } catch (error) {
            this.pools.set(pool.definition.id, pool);
            pool.cleanupFailures.set(node, Object.freeze({
                poolId: pool.definition.id,
                nodeName: node.name ?? "",
                attempts: (previous?.attempts ?? 0) + 1,
                retryable: !node.destroyed,
                error,
            }));
        }
    }

    private throwCleanupErrors(pool: PoolRecord, initialErrors: unknown[] = []): void {
        if (pool.cleanupFailures.size === 0) return;
        const errors = [...initialErrors, ...Array.from(pool.cleanupFailures.values(), (failure) => failure.error)];
        if (errors.length > 0) throw new PrefabPoolCleanupError(errors);
    }

    private requirePool(id: string): PoolRecord {
        const pool = this.pools.get(id);
        if (!pool) {
            throw new Error(`Unknown prefab pool '${id}'.`);
        }
        return pool;
    }

    private requireActive(): void {
        if (this.disposed) {
            throw new Error("PrefabPoolService has been disposed.");
        }
    }
}
