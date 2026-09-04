import type {
    ResourceGroupController,
    ResourceLease,
} from "../../application/resource/ResourceGroup";

export interface PrefabPoolDefinition<TNode extends Laya.Node = Laya.Node> {
    readonly id: string;
    readonly url: string;
    readonly group: string;
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
    readonly resourceHeld: boolean;
}

interface PoolRecord {
    readonly definition: PrefabPoolDefinition;
    readonly idle: Laya.Node[];
    readonly active: Set<Laya.Node>;
    pendingAcquires: number;
    prefab?: Laya.Prefab;
    loading?: Promise<Laya.Prefab>;
    lease?: ResourceLease;
}

interface NodeOwnership {
    readonly poolId: string;
    active: boolean;
}

export class PrefabPoolService {
    private readonly pools = new Map<string, PoolRecord>();
    private readonly ownership = new WeakMap<Laya.Node, NodeOwnership>();
    private disposed = false;

    constructor(private readonly resources: ResourceGroupController) {}

    register<TNode extends Laya.Node>(definition: PrefabPoolDefinition<TNode>): void {
        this.requireActive();
        if (!definition.id || !definition.url || !definition.group) {
            throw new Error("Prefab pool id, url and group are required.");
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
        this.resources.assign(definition.url, definition.group);
        this.pools.set(definition.id, {
            definition: definition as PrefabPoolDefinition,
            idle: [],
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
        if (pool.idle.length >= pool.definition.maxIdle) {
            node.destroy();
            return;
        }
        pool.idle.push(node);
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
        this.releasePoolResources(pool);
    }

    snapshot(): readonly PrefabPoolSnapshot[] {
        return Array.from(this.pools.values())
            .map((pool) => Object.freeze({
                id: pool.definition.id,
                active: pool.active.size,
                pending: pool.pendingAcquires,
                idle: pool.idle.length,
                loading: pool.loading !== undefined,
                resourceHeld: pool.lease !== undefined,
            }))
            .sort((left, right) => left.id.localeCompare(right.id));
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
            this.releasePoolResources(pool);
        }
        this.pools.clear();
    }

    private takeIdle(pool: PoolRecord): Laya.Node | undefined {
        while (pool.idle.length > 0) {
            const node = pool.idle.pop();
            if (node && !node.destroyed) {
                return node;
            }
        }
        return undefined;
    }

    private async loadPrefab(pool: PoolRecord): Promise<Laya.Prefab> {
        if (pool.prefab) {
            return pool.prefab;
        }
        if (pool.loading) {
            return pool.loading;
        }
        pool.lease ??= this.resources.acquire(pool.definition.group);
        const operation = Laya.loader.load(pool.definition.url, {
            type: Laya.Loader.HIERARCHY,
            group: pool.definition.group,
        }) as Promise<Laya.Prefab | null>;
        const loading = operation.then((prefab) => {
            if (!prefab) {
                throw new Error(`Prefab pool asset '${pool.definition.url}' did not load as a Prefab.`);
            }
            if (this.disposed) {
                this.resources.releaseGroupIfUnused(pool.definition.group);
                throw new Error("PrefabPoolService was disposed while loading.");
            }
            pool.prefab = prefab;
            return prefab;
        });
        pool.loading = loading;
        try {
            return await loading;
        } catch (error) {
            pool.lease?.release();
            pool.lease = undefined;
            this.resources.releaseGroupIfUnused(pool.definition.group);
            throw error;
        } finally {
            if (pool.loading === loading) {
                pool.loading = undefined;
            }
        }
    }

    private releasePoolResources(pool: PoolRecord): void {
        for (const node of pool.idle) {
            if (!node.destroyed) {
                node.destroy();
            }
        }
        pool.idle.length = 0;
        pool.prefab = undefined;
        pool.lease?.release();
        pool.lease = undefined;
        this.resources.releaseGroupIfUnused(pool.definition.group);
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
