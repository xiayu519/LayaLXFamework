import type { AppService } from "../../../framework/application/lifecycle/AppService";
import type { RuntimeContext } from "../../../framework/bootstrap/createRuntime";
import type { Tables } from "../generated/tables/schema";

export const RUNTIME_CONFIG_ID = "lx.runtime-config";

interface RuntimeConfig {
    readonly schemaVersion: 1;
    readonly framework: string;
}

export class GameReadyService implements AppService {
    readonly name = "game-ready";

    constructor(private readonly context: Pick<RuntimeContext, "tables" | "config">,
        private readonly worlds: { enterLobby(): Promise<void>; stop(): Promise<void> }) {}

    async start(): Promise<void> {
        try {
            const appConfig = this.context.tables.require<Tables>().TbTableAppConfig.get(1);
            if (appConfig?.value !== "LXFamework") {
                throw new Error("Generated app tables were not loaded correctly.");
            }
            const runtimeConfig = await this.context.config.load<RuntimeConfig>(RUNTIME_CONFIG_ID, isRuntimeConfig);
            if (runtimeConfig.framework !== "LXFamework") {
                throw new Error("Runtime JSON configuration was not loaded correctly.");
            }
            await this.worlds.enterLobby();
            console.log("[LX] CONFIG READY");
        } catch (error) {
            this.context.config.release(RUNTIME_CONFIG_ID);
            throw error;
        }
    }

    async stop(): Promise<void> {
        try { await this.worlds.stop(); }
        finally { this.context.config.release(RUNTIME_CONFIG_ID); }
    }
}

function isRuntimeConfig(value: unknown): value is RuntimeConfig {
    if (!value || typeof value !== "object") {
        return false;
    }
    const config = value as Partial<RuntimeConfig>;
    return config.schemaVersion === 1 && typeof config.framework === "string";
}
