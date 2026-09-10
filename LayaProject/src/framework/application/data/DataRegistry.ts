/** A lightweight key imports query types, never UI or model implementations. */
export interface DataKey<T> {
    readonly id: string;
    readonly valueType?: T;
}

export interface DataEntry<T = unknown> {
    readonly key: DataKey<T>;
    readonly value: T;
}

/** Application-owned data modules are supplied before services/network start. This does not create models. */
export class DataRegistry {
    private readonly entries = new Map<string, unknown>();

    constructor(entries: readonly DataEntry[] = []) {
        for (const { key, value } of entries) {
            if (!key.id || this.entries.has(key.id)) throw new Error(`Duplicate or empty data key '${key.id}'.`);
            this.entries.set(key.id, value);
        }
    }

    get<T>(key: DataKey<T>): T {
        if (!this.entries.has(key.id)) throw new Error(`Data module '${key.id}' is not registered.`);
        return this.entries.get(key.id) as T;
    }
}
