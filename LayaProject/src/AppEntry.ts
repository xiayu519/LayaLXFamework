import { lx } from "./framework/lx";
import { xlog } from "./framework/xlog";
import { GameApplication, StartupScene } from "./game/bootstrap/GameStartup";

/** 统筹启动和失败回滚；启动场景只负责展示进度。 */
export class AppEntry {
    private static startup: Promise<void> | undefined;
    private static failedStartup: StartupScene | undefined;

    public static async start(): Promise<void> {
        if (!this.startup && lx.ready) {
            return;
        }
        // 先保存共享任务，再调用模块，避免模块同步重入启动入口。
        const operation = this.startup ??= Promise.resolve().then(() => this.startApplication());
        try {
            await operation;
        } finally {
            if (this.startup === operation) {
                this.startup = undefined;
            }
        }
    }

    private static async startApplication(): Promise<void> {
        this.failedStartup?.destroy();
        this.failedStartup = undefined;
        const scene = await StartupScene.openStartup();
        let viewportAssigned = false;
        try {
            await lx.init(new GameApplication({
                onServiceProgress: progress => {
                    if (!viewportAssigned) {
                        scene.setViewportProvider(lx.platform);
                        viewportAssigned = true;
                    }
                    scene.onServiceProgress(progress);
                },
                onSceneProgress: scene.onSceneProgress,
            }));
            scene.destroy();
            if (lx.ready) {
                xlog.log("[LX] READY");
            }
        } catch (error) {
            scene.fail(error);
            this.failedStartup = scene;
            try {
                await lx.stop();
            } catch (shutdownError) {
                throw Object.assign(new Error("Application startup and rollback failed."), {
                    errors: [error, shutdownError],
                });
            }
            // 将错误交给原生启动流程报告，不吞掉启动失败。
            throw error;
        }
    }
}

/** 原生编译入口；引擎会先完成初始化，再调用 main。 */
export function main(): Promise<void> {
    return AppEntry.start();
}
