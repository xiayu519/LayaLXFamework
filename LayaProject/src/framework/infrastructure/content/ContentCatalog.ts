export interface ContentEntry {
    readonly id: string;
    readonly url: string;
    readonly kind: "ui" | "scene" | "prefab" | "spine" | "audio" | "data" | "other";
}

export class ContentCatalog {
    private readonly entries = new Map<string, Readonly<ContentEntry>>();

    constructor(entries: readonly ContentEntry[]) {
        for (const entry of entries) {
            if (!entry.id || !entry.url) {
                throw new Error("Content id and url are required.");
            }
            if (this.entries.has(entry.id)) {
                throw new Error(`Duplicate content id '${entry.id}'.`);
            }
            this.entries.set(entry.id, Object.freeze({ ...entry }));
        }
    }

    has(id: string): boolean {
        return this.entries.has(id);
    }

    get(id: string): Readonly<ContentEntry> {
        const entry = this.entries.get(id);
        if (!entry) {
            throw new Error(`Unknown content id '${id}'.`);
        }
        return entry;
    }

    list(): readonly Readonly<ContentEntry>[] {
        return Array.from(this.entries.values());
    }
}
