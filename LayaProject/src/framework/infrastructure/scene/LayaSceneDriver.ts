import type { SceneDriver } from "../../application/scene/SceneRouter";

export class LayaSceneDriver implements SceneDriver<Laya.Scene> {
    open(url: string, params?: unknown): Promise<Laya.Scene> {
        return Laya.Scene.open(url, false, params);
    }

    close(scene: Laya.Scene): void {
        if (scene.destroyed) {
            return;
        }
        scene.close();
        if (!scene.destroyed) {
            scene.destroy(true);
        }
    }
}
