import type { AppService } from "../../../framework/application/lifecycle/AppService";
import { lx } from "../../../framework/lx";
import type { Tables } from "../generated/tables/schema";

export const RUNTIME_CONFIG_ID = "lx.runtime-config";

interface RuntimeConfig {
    readonly schemaVersion: 1;
    readonly framework: string;
}

export class GameReadyService implements AppService {
    readonly name = "game-ready";

    constructor(private readonly sceneRoute: string) {}

    async start(): Promise<void> {
        try {
            const appConfig = lx.tables.require<Tables>().TbTableAppConfig.get(1);
            if (appConfig?.value !== "LXFamework") {
                throw new Error("Generated app tables were not loaded correctly.");
            }
            const runtimeConfig = await lx.config.load<RuntimeConfig>(RUNTIME_CONFIG_ID, isRuntimeConfig);
            if (runtimeConfig.framework !== "LXFamework") {
                throw new Error("Runtime JSON configuration was not loaded correctly.");
            }
            await lx.sceneFlow.open(this.sceneRoute, {
                status: "READY",
                detail: "旅行补给站\n补给、奖励与背包随时同步",
            });
            console.log("[LX] CONFIG READY");
        } catch (error) {
            lx.config.release(RUNTIME_CONFIG_ID);
            throw error;
        }
    }

    stop(): void {
        lx.config.release(RUNTIME_CONFIG_ID);
    }
}

function isRuntimeConfig(value: unknown): value is RuntimeConfig {
    if (!value || typeof value !== "object") {
        return false;
    }
    const config = value as Partial<RuntimeConfig>;
    return config.schemaVersion === 1 && typeof config.framework === "string";
}
