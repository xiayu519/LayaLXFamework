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
    readonly recovery?: SaveRecoveryReason;
}

export type SaveRecoveryReason =
    | "invalid-json"
    | "invalid-envelope"
    | "missing-migration"
    | "migration-failed"
    | "invalid-data";

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

export type SaveStorageOperation = "read" | "write" | "verify-write" | "remove" | "verify-remove";

export class SaveStorageError extends Error {
    constructor(
        readonly key: string,
        readonly operation: SaveStorageOperation,
        readonly cause?: unknown,
    ) {
        super(`Save storage '${key}' failed during ${operation}.`);
        this.name = "SaveStorageError";
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
        const raw = this.readStored();
        if (raw === null) {
            return this.createDefault(true);
        }

        let envelope: SaveEnvelope;
        try {
            const parsed: unknown = JSON.parse(raw);
            if (!this.isEnvelope(parsed)) {
                return this.createDefault(false, "invalid-envelope");
            }
            envelope = parsed;
        } catch {
            return this.createDefault(false, "invalid-json");
        }

        if (envelope.version > this.schema.currentVersion) {
            throw new UnsupportedSaveVersionError(envelope.version, this.schema.currentVersion);
        }

        let value: unknown = envelope.data;
        let version = envelope.version;
        while (version < this.schema.currentVersion) {
            const migration = this.schema.migrations?.[version];
            if (!migration) {
                return this.createDefault(false, "missing-migration");
            }
            try {
                value = migration(value);
            } catch {
                return this.createDefault(false, "migration-failed");
            }
            version += 1;
        }

        if (!this.schema.validate(value)) {
            return this.createDefault(false, "invalid-data");
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
        const serialized = JSON.stringify(envelope);
        // Read immediately before writing: a different client may have upgraded
        // since load(). LocalStorage has no transaction/CAS across browser tabs.
        this.assertWritableVersion(this.readStored());
        try {
            this.driver.setItem(this.schema.key, serialized);
        } catch (cause) {
            throw new SaveStorageError(this.schema.key, "write", cause);
        }
        if (this.readStored("verify-write") !== serialized) {
            throw new SaveStorageError(this.schema.key, "verify-write");
        }
    }

    clear(): void {
        try {
            this.driver.removeItem(this.schema.key);
        } catch (cause) {
            throw new SaveStorageError(this.schema.key, "remove", cause);
        }
        if (this.readStored("verify-remove") !== null) {
            throw new SaveStorageError(this.schema.key, "verify-remove");
        }
    }

    private readStored(operation: SaveStorageOperation = "read"): string | null {
        try {
            return this.driver.getItem(this.schema.key);
        } catch (cause) {
            throw new SaveStorageError(this.schema.key, operation, cause);
        }
    }

    private assertWritableVersion(raw: string | null): void {
        if (raw === null) return;
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            return;
        }
        if (this.isEnvelope(parsed) && parsed.version > this.schema.currentVersion) {
            throw new UnsupportedSaveVersionError(parsed.version, this.schema.currentVersion);
        }
    }

    private createDefault(persist: boolean, recovery?: SaveRecoveryReason): SaveLoadResult<T> {
        const value = this.schema.createDefault();
        if (!this.schema.validate(value)) {
            throw new Error(`Save schema '${this.schema.key}' produced invalid default data.`);
        }
        if (persist) {
            this.save(value);
        }
        return recovery
            ? { value, source: "default", recovery }
            : { value, source: "default" };
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
