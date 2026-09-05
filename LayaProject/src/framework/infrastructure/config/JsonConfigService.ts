import type { ContentCatalog } from "../content/ContentCatalog";

export type JsonValidator<T> = (value: unknown) => value is T;

export interface JsonConfigSnapshot {
    readonly id: string;
    readonly url: string;
    readonly state: "loading" | "loaded";
}

interface ConfigRecord {
    readonly id: string;
    readonly url: string;
    value?: unknown;
    loaded: boolean;
    pending?: Promise<unknown>;
}

export class JsonConfigValidationError extends Error {
    constructor(readonly id: string) {
        super(`JSON data '${id}' failed validation.`);
        this.name = "JsonConfigValidationError";
    }
}

export class JsonConfigService {
    private readonly records = new Map<string, ConfigRecord>();
    private readonly pendingLoads = new Set<Promise<unknown>>();
    private disposed = false;

    constructor(private readonly content: ContentCatalog) {}

    get ready(): boolean {
        return Array.from(this.records.values()).some((record) => record.loaded);
    }

    async load<T>(id: string, validate?: JsonValidator<T>): Promise<T> {
        this.requireActive();
        const value = await this.loadRaw(id);
        return this.validate(id, value, validate);
    }

    get<T>(id: string, validate?: JsonValidator<T>): T | undefined {
        const record = this.records.get(id);
        if (!record?.loaded) {
            return undefined;
        }
        return this.validate(id, record.value, validate);
    }

    require<T>(id: string, validate?: JsonValidator<T>): T {
        const constValue = this.get(id, validate);
        if (constValue === undefined) {
            throw new Error(`JSON data '${id}' is not loaded.`);
        }
        return constValue;
    }

    release(id: string): boolean {
        this.requireActive();
        const record = this.records.get(id);
        if (!record) {
            return false;
        }
        this.records.delete(id);
        Laya.loader.clearRes(record.url);
        return true;
    }

    snapshot(): readonly JsonConfigSnapshot[] {
        return Array.from(this.records.values())
            .map((record) => Object.freeze({
                id: record.id,
                url: record.url,
                state: record.loaded ? "loaded" as const : "loading" as const,
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
        for (const record of this.records.values()) {
            Laya.loader.clearRes(record.url);
        }
        this.records.clear();
    }

    private loadRaw(id: string): Promise<unknown> {
        const existing = this.records.get(id);
        if (existing?.loaded) {
            return Promise.resolve(existing.value);
        }
        if (existing?.pending) {
            return existing.pending;
        }

        const entry = this.content.get(id);
        if (entry.kind !== "data") {
            throw new Error(`Content '${id}' must use kind 'data' to load through LX.Config.`);
        }
        const record: ConfigRecord = {
            id,
            url: entry.url,
            loaded: false,
        };
        const operation = (Laya.loader.load(entry.url, {
            type: Laya.Loader.JSON,
        }) as Promise<Laya.TextResource | null>).then((resource) => {
            if (this.disposed || this.records.get(id) !== record) {
                if (!this.records.has(id)) {
                    Laya.loader.clearRes(entry.url);
                }
                throw new Error(`JSON data request '${id}' was superseded.`);
            }
            if (!(resource instanceof Laya.TextResource)) {
                throw new Error(`JSON data '${id}' did not load as a JSON TextResource.`);
            }
            const value: unknown = resource.data;
            record.value = value;
            record.loaded = true;
            return value;
        }).catch((error: unknown) => {
            if (this.records.get(id) === record) {
                this.records.delete(id);
                Laya.loader.clearRes(entry.url);
            }
            throw error;
        });
        record.pending = operation;
        this.records.set(id, record);
        this.pendingLoads.add(operation);
        operation.finally(() => {
            this.pendingLoads.delete(operation);
            if (record.pending === operation) {
                record.pending = undefined;
            }
        }).catch(() => {});
        return operation;
    }

    private validate<T>(id: string, value: unknown, validate?: JsonValidator<T>): T {
        if (validate && !validate(value)) {
            this.releaseInvalid(id);
            throw new JsonConfigValidationError(id);
        }
        return value as T;
    }

    private releaseInvalid(id: string): void {
        const record = this.records.get(id);
        if (record) {
            this.records.delete(id);
            Laya.loader.clearRes(record.url);
        }
    }

    private requireActive(): void {
        if (this.disposed) {
            throw new Error("JSON configuration service has been disposed.");
        }
    }
}
