/** 轻量数据键只导入查询类型，不导入 UI 或模型实现。 */
export interface DataKey<T> {
    readonly id: string;
    readonly valueType?: T;
}

export interface DataEntry<T = unknown> {
    readonly key: DataKey<T>;
    readonly value: T;
}

/** 应用持有的数据模块在服务和网络启动前提供；此处不创建模型。 */
export class DataRegistry {
    private readonly entries = new Map<string, unknown>();

    public constructor(entries: readonly DataEntry[] = []) {
        for (const { key, value } of entries) {
            if (!key.id || this.entries.has(key.id)) {
                throw new Error(`Duplicate or empty data key '${key.id}'.`);
            }
            this.entries.set(key.id, value);
        }
    }

    public get<T>(key: DataKey<T>): T {
        if (!this.entries.has(key.id)) {
            throw new Error(`Data module '${key.id}' is not registered.`);
        }
        return this.entries.get(key.id) as T;
    }
}
