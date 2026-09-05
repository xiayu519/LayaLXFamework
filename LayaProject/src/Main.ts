import {
    createApplication,
    FRAMEWORK_STATUS_ROUTE,
    RUNTIME_CONFIG_ID,
    type ApplicationRuntime,
    type GameTables,
} from "./game/bootstrap/createApplication";
import { LX } from "./framework/LX";

const { regClass } = Laya;

@regClass()
export class Main extends Laya.Script {
    private application: ApplicationRuntime | undefined;

    onStart() {
        void this.startApplication();
    }

    onDestroy(): void {
        const application = this.application;
        this.application = undefined;
        if (application) {
            void application.stop()
                .catch((error: unknown) => {
                    console.error("[LX] shutdown failed", error);
                });
        }
    }

    private async startApplication(): Promise<void> {
        try {
            const application = createApplication();
            this.application = application;
            await application.start();
            if (this.destroyed || this.application !== application) {
                await application.stop();
                return;
            }
            const appConfig = LX.Tables.require<GameTables>().TbTableAppConfig.get(1);
            if (appConfig?.value !== "LXFamework") {
                throw new Error("Generated app tables were not loaded correctly.");
            }
            const runtimeConfig = await LX.Config.load<RuntimeConfig>(RUNTIME_CONFIG_ID, isRuntimeConfig);
            if (runtimeConfig.framework !== "LXFamework") {
                throw new Error("Runtime JSON configuration was not loaded correctly.");
            }
            await LX.UI.show(FRAMEWORK_STATUS_ROUTE, {
                status: "READY",
                detail: "LayaAir 3.4.1 / ui2\nNative-first services / headless verification",
            });
            console.log("[LX] CONFIG READY");
            console.log("[LX] READY");
        } catch (error) {
            const application = this.application;
            this.application = undefined;
            if (application) {
                try {
                    await application.stop();
                } catch (shutdownError) {
                    console.error("[LX] rollback shutdown failed", shutdownError);
                }
            }
            console.error("[LX] bootstrap failed", error);
        }
    }
}

interface RuntimeConfig {
    readonly schemaVersion: 1;
    readonly framework: string;
}

function isRuntimeConfig(value: unknown): value is RuntimeConfig {
    if (!value || typeof value !== "object") {
        return false;
    }
    const config = value as Partial<RuntimeConfig>;
    return config.schemaVersion === 1 && typeof config.framework === "string";
}
