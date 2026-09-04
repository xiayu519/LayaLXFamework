import { describe, expect, it } from "vitest";
import {
    SaveStore,
    UnsupportedSaveVersionError,
    type SaveSchema,
    type StorageDriver,
} from "../src/framework/infrastructure/storage/SaveStore";

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
    it("creates and persists defaults for missing or corrupt data", () => {
        const storage = new MemoryStorage();
        const store = new SaveStore(storage, schema);

        expect(store.load()).toEqual({ value: { name: "player", coins: 0 }, source: "default" });
        storage.setItem("save", "not-json");
        expect(store.load().source).toBe("default");
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
});
