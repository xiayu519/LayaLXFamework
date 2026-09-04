import {
    createApplication,
    FRAMEWORK_STATUS_ROUTE,
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
            const appConfig = LX.Config.require<GameTables>().TbTableAppConfig.get(1);
            if (appConfig?.value !== "LXFamework") {
                throw new Error("Generated app configuration was not loaded correctly.");
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
