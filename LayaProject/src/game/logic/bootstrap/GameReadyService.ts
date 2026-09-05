import type { AppService } from "../../../framework/application/lifecycle/AppService";
import { LX } from "../../../framework/LX";
import type { Tables } from "../generated/tables/schema";

export const RUNTIME_CONFIG_ID = "lx.runtime-config";

interface RuntimeConfig {
    readonly schemaVersion: 1;
    readonly framework: string;
}

export class GameReadyService implements AppService {
    readonly name = "game-ready";

    constructor(private readonly statusRoute: string) {}

    async start(): Promise<void> {
        try {
            const appConfig = LX.Tables.require<Tables>().TbTableAppConfig.get(1);
            if (appConfig?.value !== "LXFamework") {
                throw new Error("Generated app tables were not loaded correctly.");
            }
            const runtimeConfig = await LX.Config.load<RuntimeConfig>(RUNTIME_CONFIG_ID, isRuntimeConfig);
            if (runtimeConfig.framework !== "LXFamework") {
                throw new Error("Runtime JSON configuration was not loaded correctly.");
            }
            await LX.UI.show(this.statusRoute, {
                status: "READY",
                detail: "LayaAir 3.4.1 / ui2\nNative-first services / headless verification",
            });
            console.log("[LX] CONFIG READY");
        } catch (error) {
            LX.Config.release(RUNTIME_CONFIG_ID);
            throw error;
        }
    }

    stop(): void {
        LX.Config.release(RUNTIME_CONFIG_ID);
    }
}

function isRuntimeConfig(value: unknown): value is RuntimeConfig {
    if (!value || typeof value !== "object") {
        return false;
    }
    const config = value as Partial<RuntimeConfig>;
    return config.schemaVersion === 1 && typeof config.framework === "string";
}
