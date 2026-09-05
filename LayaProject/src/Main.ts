import {
    createApplication,
    type ApplicationRuntime,
} from "./game/bootstrap/createApplication";

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
