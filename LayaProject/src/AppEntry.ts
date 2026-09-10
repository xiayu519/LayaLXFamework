import { lx } from "./framework/lx";
import { createApplication } from "./game/bootstrap/createApplication";

let startup: Promise<void> | undefined;

/** Native Laya entry: the engine has already initialized before calling main. */
export async function main(): Promise<void> {
    if (lx.ready) return;
    // Publish before invoking services, which may synchronously request entry again.
    const operation = startup ??= Promise.resolve().then(startApplication);
    try {
        await operation;
    } finally {
        if (startup === operation) startup = undefined;
    }
}

async function startApplication(): Promise<void> {
    const application = createApplication();
    try {
        await application.start();
        if (application.bootstrap.state === "running") console.log("[LX] READY");
    } catch (error) {
        try {
            await application.stop();
        } catch (shutdownError) {
            throw Object.assign(new Error("Application startup and rollback failed."), {
                errors: [error, shutdownError],
            });
        }
        // Let the native startup handler report the error; do not swallow failure.
        throw error;
    }
}
