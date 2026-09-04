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
}

interface PoolRecord {
    readonly definition: PrefabPoolDefinition;
    readonly sign: string;
    readonly active: Set<Laya.Node>;
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
            node.active = true;
            try {
                pool.definition.onAcquire?.(node);
            } catch (error) {
                pool.active.delete(node);
                owner.active = false;
                node.destroy();
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
        node.removeSelf();
        try {
            pool.definition.onRelease?.(node);
        } catch (error) {
            node.destroy();
            throw error;
        }
        node.active = false;
        if (Laya.Pool.getPoolBySign(pool.sign).length >= pool.definition.maxIdle) {
            node.destroy();
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
        this.destroyIdle(pool);
    }

    snapshot(): readonly PrefabPoolSnapshot[] {
        return Array.from(this.pools.values())
            .map((pool) => Object.freeze({
                id: pool.definition.id,
                active: pool.active.size,
                pending: pool.pendingAcquires,
                idle: Laya.Pool.getPoolBySign(pool.sign).length,
                loading: pool.loading !== undefined,
            }))
            .sort((left, right) => left.id.localeCompare(right.id));
    }

    async waitForPendingLoads(): Promise<void> {
        while (this.pendingLoads.size > 0) {
            await Promise.allSettled(Array.from(this.pendingLoads));
        }
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        for (const pool of this.pools.values()) {
            for (const node of pool.active) {
                if (!node.destroyed) {
                    node.destroy();
                }
            }
            pool.active.clear();
            this.destroyIdle(pool);
        }
        this.pools.clear();
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
        const idle = Laya.Pool.getPoolBySign(pool.sign) as Laya.Node[];
        for (const node of idle) {
            if (!node.destroyed) {
                node.destroy();
            }
        }
        Laya.Pool.clearBySign(pool.sign);
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
