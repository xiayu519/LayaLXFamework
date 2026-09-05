import { describe, expect, it } from "vitest";
import {
    SaveStore,
    SaveStorageError,
    UnsupportedSaveVersionError,
    type SaveSchema,
    type StorageDriver,
} from "../../src/framework/infrastructure/storage/SaveStore";

interface SaveData {
    name: string;
    coins: number;
}

class MemoryStorage implements StorageDriver {
    readonly values = new Map<string, string>();

    getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.values.set(key, value);
    }

    removeItem(key: string): void {
        this.values.delete(key);
    }
}

const schema: SaveSchema<SaveData> = {
    key: "save",
    currentVersion: 2,
    createDefault: () => ({ name: "player", coins: 0 }),
    validate(value: unknown): value is SaveData {
        const data = value as Partial<SaveData> | null;
        return !!data && typeof data.name === "string" && typeof data.coins === "number";
    },
    migrations: {
        1: (value) => ({ ...(value as { name: string }), coins: 0 }),
    },
};

describe("SaveStore", () => {
    it("persists defaults only when stored data is missing", () => {
        const storage = new MemoryStorage();
        const store = new SaveStore(storage, schema);

        expect(store.load()).toEqual({ value: { name: "player", coins: 0 }, source: "default" });
        expect(JSON.parse(storage.getItem("save") ?? "{}")).toEqual({
            version: 2,
            data: { name: "player", coins: 0 },
        });
    });

    it("returns an observable default without overwriting corrupt data", () => {
        const storage = new MemoryStorage();
        const raw = "not-json";
        storage.setItem("save", raw);

        expect(new SaveStore(storage, schema).load()).toEqual({
            value: { name: "player", coins: 0 },
            source: "default",
            recovery: "invalid-json",
        });
        expect(storage.getItem("save")).toBe(raw);
    });

    it("migrates older data and persists the current envelope", () => {
        const storage = new MemoryStorage();
        storage.setItem("save", JSON.stringify({ version: 1, data: { name: "old" } }));
        const result = new SaveStore(storage, schema).load();

        expect(result).toEqual({ value: { name: "old", coins: 0 }, source: "migrated" });
        expect(JSON.parse(storage.getItem("save") ?? "{}").version).toBe(2);
    });

    it("does not overwrite saves from a newer client", () => {
        const storage = new MemoryStorage();
        const raw = JSON.stringify({ version: 3, data: { name: "future", coins: 99 } });
        storage.setItem("save", raw);

        expect(() => new SaveStore(storage, schema).load()).toThrow(UnsupportedSaveVersionError);
        expect(storage.getItem("save")).toBe(raw);
    });

    it("protects a newer version on every write, including after an earlier successful load", () => {
        const storage = new MemoryStorage();
        const store = new SaveStore(storage, schema);
        const loaded = store.load().value;
        const raw = JSON.stringify({ version: 3, data: { name: "future", coins: 99 } });
        storage.setItem("save", raw);

        expect(() => store.save(loaded)).toThrow(UnsupportedSaveVersionError);
        expect(() => store.load()).toThrow(UnsupportedSaveVersionError);
        expect(() => store.save(loaded)).toThrow(UnsupportedSaveVersionError);
        expect(storage.getItem("save")).toBe(raw);
    });

    it("reports writes that silently do not persist", () => {
        const storage: StorageDriver = {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
        };
        const store = new SaveStore(storage, schema);

        expect(() => store.save({ name: "player", coins: 3 })).toThrow("verify-write");
        expect(() => store.load()).toThrow("verify-write");
        expect(() => store.save({ name: "player", coins: 3 })).toThrow(SaveStorageError);
    });

    it("reports storage read, write and remove failures without claiming persistence", () => {
        const storage = new MemoryStorage();
        const store = new SaveStore(storage, schema);
        storage.getItem = () => { throw new Error("storage denied"); };
        expect(() => store.load()).toThrow("read");
        storage.getItem = () => null;
        storage.setItem = () => { throw new Error("quota exceeded"); };
        expect(() => store.save({ name: "player", coins: 3 })).toThrow("write");
        storage.removeItem = () => { throw new Error("storage denied"); };
        expect(() => store.clear()).toThrow("remove");
    });

    it("does not claim a successful clear if the driver silently retains data", () => {
        const storage = new MemoryStorage();
        const store = new SaveStore(storage, schema);
        store.load();
        storage.removeItem = () => {};
        expect(() => store.clear()).toThrow("verify-remove");
    });

    it("preserves raw data when migration is missing or fails", () => {
        const storage = new MemoryStorage();
        const raw = JSON.stringify({ version: 1, data: { name: "old" } });
        storage.setItem("save", raw);
        const missingMigration = { ...schema, migrations: undefined };

        expect(new SaveStore(storage, missingMigration).load().recovery).toBe("missing-migration");
        expect(storage.getItem("save")).toBe(raw);

        const failedMigration: SaveSchema<SaveData> = {
            ...schema,
            migrations: { 1: () => { throw new Error("broken migration"); } },
        };
        expect(new SaveStore(storage, failedMigration).load().recovery).toBe("migration-failed");
        expect(storage.getItem("save")).toBe(raw);
    });

    it("preserves a current-version envelope whose data fails schema validation", () => {
        const storage = new MemoryStorage();
        const raw = JSON.stringify({ version: 2, data: { name: "broken", coins: "many" } });
        storage.setItem("save", raw);

        expect(new SaveStore(storage, schema).load().recovery).toBe("invalid-data");
        expect(storage.getItem("save")).toBe(raw);
    });

    it("rejects invalid schema defaults", () => {
        const storage = new MemoryStorage();
        const invalidDefault: SaveSchema<SaveData> = {
            ...schema,
            createDefault: () => ({ name: "player", coins: Number.NaN }),
            validate(value: unknown): value is SaveData {
                const data = value as Partial<SaveData> | null;
                return !!data && typeof data.name === "string" && Number.isFinite(data.coins);
            },
        };

        expect(() => new SaveStore(storage, invalidDefault).load()).toThrow("produced invalid default");
        expect(storage.getItem("save")).toBeNull();
    });
});
