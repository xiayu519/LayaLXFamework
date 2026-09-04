export interface StorageDriver {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export interface SaveSchema<T> {
    readonly key: string;
    readonly currentVersion: number;
    createDefault(): T;
    validate(value: unknown): value is T;
    readonly migrations?: Readonly<Record<number, (value: unknown) => unknown>>;
}

export interface SaveLoadResult<T> {
    readonly value: T;
    readonly source: "stored" | "migrated" | "default";
}

interface SaveEnvelope {
    version: number;
    data: unknown;
}

export class UnsupportedSaveVersionError extends Error {
    constructor(readonly storedVersion: number, readonly currentVersion: number) {
        super(`Save version ${storedVersion} is newer than supported version ${currentVersion}.`);
        this.name = "UnsupportedSaveVersionError";
    }
}

export class SaveStore<T> {
    constructor(
        private readonly driver: StorageDriver,
        private readonly schema: SaveSchema<T>,
    ) {
        if (!schema.key || !Number.isInteger(schema.currentVersion) || schema.currentVersion < 1) {
            throw new Error("Save schema needs a key and a positive integer version.");
        }
    }

    load(): SaveLoadResult<T> {
        const raw = this.driver.getItem(this.schema.key);
        if (raw === null) {
            return this.createAndPersistDefault();
        }

        let envelope: SaveEnvelope;
        try {
            const parsed: unknown = JSON.parse(raw);
            if (!this.isEnvelope(parsed)) {
                return this.createAndPersistDefault();
            }
            envelope = parsed;
        } catch {
            return this.createAndPersistDefault();
        }

        if (envelope.version > this.schema.currentVersion) {
            throw new UnsupportedSaveVersionError(envelope.version, this.schema.currentVersion);
        }

        let value: unknown = envelope.data;
        let version = envelope.version;
        while (version < this.schema.currentVersion) {
            const migration = this.schema.migrations?.[version];
            if (!migration) {
                return this.createAndPersistDefault();
            }
            value = migration(value);
            version += 1;
        }

        if (!this.schema.validate(value)) {
            return this.createAndPersistDefault();
        }

        if (version !== envelope.version) {
            this.save(value);
            return { value, source: "migrated" };
        }
        return { value, source: "stored" };
    }

    save(value: T): void {
        if (!this.schema.validate(value)) {
            throw new Error(`Refusing to save invalid data for '${this.schema.key}'.`);
        }
        const envelope: SaveEnvelope = {
            version: this.schema.currentVersion,
            data: value,
        };
        this.driver.setItem(this.schema.key, JSON.stringify(envelope));
    }

    clear(): void {
        this.driver.removeItem(this.schema.key);
    }

    private createAndPersistDefault(): SaveLoadResult<T> {
        const value = this.schema.createDefault();
        this.save(value);
        return { value, source: "default" };
    }

    private isEnvelope(value: unknown): value is SaveEnvelope {
        if (!value || typeof value !== "object") {
            return false;
        }
        const candidate = value as Partial<SaveEnvelope>;
        return Number.isInteger(candidate.version) && (candidate.version ?? 0) >= 1 && "data" in candidate;
    }
}

export class LayaLocalStorageDriver implements StorageDriver {
    getItem(key: string): string | null {
        return Laya.LocalStorage.getItem(key);
    }

    setItem(key: string, value: string): void {
        Laya.LocalStorage.setItem(key, value);
    }

    removeItem(key: string): void {
        Laya.LocalStorage.removeItem(key);
    }
}
