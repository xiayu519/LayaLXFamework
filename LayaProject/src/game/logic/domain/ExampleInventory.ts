export interface ExampleItem {
    readonly id: string;
    readonly name: string;
    readonly quantity: number;
}

export interface ExampleInventorySnapshot {
    readonly version: number;
    readonly items: readonly ExampleItem[];
}

export interface ExampleInventoryPatch {
    readonly version: number;
    readonly baseVersion: number;
    readonly upserts: readonly ExampleItem[];
    readonly removedIds: readonly string[];
}

export type InventoryApplyResult = "applied" | "stale" | "invalid" | "base-mismatch";

/** One account's example state. UI selection and scrolling never enter this model. */
export class ExampleInventory {
    private entries: readonly ExampleItem[] = Object.freeze(createExampleItems());
    private revision = 1;

    get items(): readonly ExampleItem[] { return this.entries; }
    get version(): number { return this.revision; }
    get totalQuantity(): number { return this.entries.reduce((total, item) => total + item.quantity, 0); }

    snapshot(): ExampleInventorySnapshot {
        return Object.freeze({ version: this.revision, items: this.entries });
    }

    applySnapshot(input: unknown): InventoryApplyResult {
        if (!isRecord(input) || !isVersion(input.version) || !isItems(input.items)) return "invalid";
        if (input.version <= this.revision) return "stale";
        this.entries = freezeItems(input.items);
        this.revision = input.version;
        return "applied";
    }

    applyPatch(input: unknown): InventoryApplyResult {
        if (!isRecord(input) || !isVersion(input.version) || !isVersion(input.baseVersion)
            || input.version <= input.baseVersion || !isItems(input.upserts)
            || !Array.isArray(input.removedIds) || !input.removedIds.every(isId)
            || new Set(input.removedIds).size !== input.removedIds.length) return "invalid";
        const removed = new Set<string>(input.removedIds);
        if (input.upserts.some(item => removed.has(item.id))) return "invalid";
        if (input.version <= this.revision) return "stale";
        if (input.baseVersion !== this.revision) return "base-mismatch";

        const updates = new Map(input.upserts.map(item => [item.id,
            Object.freeze({ id: item.id, name: item.name, quantity: item.quantity })]));
        const next: ExampleItem[] = [];
        for (const item of this.entries) {
            if (!removed.has(item.id)) next.push(updates.get(item.id) ?? item);
            updates.delete(item.id);
        }
        next.push(...updates.values());
        if (next.length > 10_000) return "invalid";
        this.entries = Object.freeze(next);
        this.revision = input.version;
        return "applied";
    }

    use(id: string): boolean {
        const item = this.entries.find(entry => entry.id === id);
        if (!item || item.quantity === 0) return false;
        return this.applyPatch({ version: this.revision + 1, baseVersion: this.revision,
            upserts: [{ ...item, quantity: item.quantity - 1 }], removedIds: [] }) === "applied";
    }

    reset(): void {
        if (this.applySnapshot({ version: this.revision + 1, items: createExampleItems() }) !== "applied") {
            throw new Error("Example inventory revision is exhausted.");
        }
    }
}

export function createExampleItems(): readonly ExampleItem[] {
    const names = ["清泉饮水", "旅行干粮", "恢复药剂", "营地火种", "探险地图"];
    return Array.from({ length: 100 }, (_, index) => Object.freeze({
        id: `supply-${index + 1}`,
        name: `${names[index % names.length]} · ${String(index + 1).padStart(3, "0")}`,
        quantity: 3,
    }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function isVersion(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isId(value: unknown): value is string {
    return typeof value === "string" && value.length > 0 && value.length <= 128 && value.trim() === value;
}

function isItems(value: unknown): value is ExampleItem[] {
    if (!Array.isArray(value) || value.length > 10_000) return false;
    const ids = new Set<string>();
    for (const item of value) {
        if (!isRecord(item) || !isId(item.id) || ids.has(item.id)
            || typeof item.name !== "string" || !item.name.trim() || item.name.length > 100
            || typeof item.quantity !== "number" || !Number.isSafeInteger(item.quantity)
            || item.quantity < 0 || item.quantity > 1_000_000) return false;
        ids.add(item.id);
    }
    return true;
}

function freezeItems(items: readonly ExampleItem[]): readonly ExampleItem[] {
    return Object.freeze(items.map(item => Object.freeze({ id: item.id, name: item.name, quantity: item.quantity })));
}
