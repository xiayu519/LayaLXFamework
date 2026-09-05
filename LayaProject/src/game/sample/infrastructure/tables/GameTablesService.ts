import type { AppService } from "../../../../framework/application/lifecycle/AppService";
import type { TablesRegistry } from "../../../../framework/application/config/TablesRegistry";
import ByteBuf from "../../generated/luban/ByteBuf";
import { Tables } from "../../generated/tables/schema";

const TABLES_ROOT = "bootstrap/game/tables";

export class GameTablesService implements AppService {
    readonly name = "game-tables";
    private readonly loadedUrls = new Set<string>();
    private tables: Tables | undefined;
    private startTask: Promise<void> | undefined;

    constructor(private readonly registry: TablesRegistry) {}

    start(): Promise<void> {
        if (this.tables) {
            return Promise.resolve();
        }
        return this.startTask ??= this.load();
    }

    stop(): void {
        if (this.tables) {
            this.registry.clear(this.tables);
            this.tables = undefined;
        }
        this.clearResources();
        this.startTask = undefined;
    }

    private async load(): Promise<void> {
        const names = Tables.getTableNames();
        const buffers = new Map<string, Uint8Array>();
        try {
            const results = await Promise.allSettled(names.map(async (name) => {
                const url = `${TABLES_ROOT}/${name}.bin`;
                this.loadedUrls.add(url);
                const loaded = await Laya.loader.load(url, Laya.Loader.BUFFER) as unknown;
                buffers.set(name, toBytes(loaded, name));
            }));
            const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
            if (failure) {
                throw failure.reason;
            }
            const tables = new Tables((name) => {
                const bytes = buffers.get(name);
                if (!bytes) {
                    throw new Error(`Luban table '${name}' was not loaded.`);
                }
                return new ByteBuf(bytes);
            });
            this.tables = this.registry.install(tables);
        } catch (error) {
            this.clearResources();
            throw error;
        } finally {
            this.startTask = undefined;
        }
    }

    private clearResources(): void {
        for (const url of this.loadedUrls) {
            Laya.loader.clearRes(url);
        }
        this.loadedUrls.clear();
    }
}

function toBytes(loaded: unknown, name: string): Uint8Array {
    const payload = loaded && typeof loaded === "object" && "data" in loaded
        ? (loaded as { readonly data: unknown }).data
        : loaded;
    if (payload instanceof ArrayBuffer) {
        return new Uint8Array(payload);
    }
    if (ArrayBuffer.isView(payload)) {
        return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
    }
    throw new Error(`Table '${name}' did not load as a binary TextResource.`);
}
