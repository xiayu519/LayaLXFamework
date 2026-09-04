import type { AppService } from "../../../framework/application/lifecycle/AppService";
import type { ConfigRegistry } from "../../../framework/application/config/ConfigRegistry";
import ByteBuf from "../../generated/luban/ByteBuf";
import { Tables } from "../../generated/config/schema";

const CONFIG_ROOT = "bootstrap/config/game";

export class GameConfigService implements AppService {
    readonly name = "game-config";
    private tables: Tables | undefined;
    private startTask: Promise<void> | undefined;

    constructor(private readonly registry: ConfigRegistry) {}

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
        this.startTask = undefined;
    }

    private async load(): Promise<void> {
        const names = Tables.getTableNames();
        const buffers = new Map<string, Uint8Array>();
        try {
            await Promise.all(names.map(async (name) => {
                const url = `${CONFIG_ROOT}/${name}.bin`;
                const loaded = await Laya.loader.load(url, Laya.Loader.BUFFER) as unknown;
                buffers.set(name, toBytes(loaded, name));
            }));
            const tables = new Tables((name) => {
                const bytes = buffers.get(name);
                if (!bytes) {
                    throw new Error(`Luban table '${name}' was not loaded.`);
                }
                return new ByteBuf(bytes);
            });
            this.tables = this.registry.install(tables);
        } finally {
            this.startTask = undefined;
        }
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
    throw new Error(`Configuration '${name}' did not load as a binary TextResource.`);
}
