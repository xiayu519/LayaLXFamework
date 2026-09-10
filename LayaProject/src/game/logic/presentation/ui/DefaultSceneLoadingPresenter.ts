import { BaseGameWindow } from "../../../../framework/presentation/ui/BaseGameWindow";
import { UILayer } from "../../../../framework/presentation/ui/UILayer";
import { UIRouter, type UIRoute } from "../../../../framework/presentation/ui/UIRouter";
import type { SceneLoadingPresenter, SceneTransitionPhase, SceneTransitionProgress } from "../../../../framework/presentation/scene/SceneFlow";
import { UISceneLoading } from "./UISceneLoading";

export const DEFAULT_SCENE_LOADING_ROUTE_ID = "lx.scene-loading";

const PHASE_LABELS: Readonly<Record<SceneTransitionPhase, string>> = Object.freeze({
    scene: "正在加载场景",
    resources: "正在加载资源",
    prepare: "正在初始化",
    switch: "正在准备显示",
    cleanup: "正在清理旧场景",
    ready: "加载完成",
});

export class DefaultSceneLoadingPresenter implements SceneLoadingPresenter {
    private readonly route: UIRoute<SceneTransitionProgress>;
    private window: UISceneLoadingWindow | undefined;
    private generation = 0;

    constructor(private readonly ui: UIRouter, prefabUrl: string) {
        this.route = ui.register({
            id: DEFAULT_SCENE_LOADING_ROUTE_ID,
            url: prefabUrl,
            layer: UILayer.System,
            modal: true,
            layout: "fullscreen",
            multiplicity: "singleton",
            retention: "hide",
            create: (pane) => {
                if (!(pane instanceof UISceneLoading)) throw new Error("UISceneLoading.lh requires UISceneLoading Runtime.");
                return new UISceneLoadingWindow(pane);
            },
        });
    }

    async show(progress: SceneTransitionProgress): Promise<void> {
        const generation = ++this.generation;
        const window = await this.ui.show(this.route, progress) as UISceneLoadingWindow;
        if (generation !== this.generation) return;
        this.window = window;
        window.setProgress(progress);
    }

    update(progress: SceneTransitionProgress): void {
        if (this.window && !this.window.destroyed) this.window.setProgress(progress);
    }

    fail(progress: SceneTransitionProgress, error: unknown): void {
        if (this.window && !this.window.destroyed) this.window.setFailure(progress, error);
    }

    hide(): void {
        this.generation += 1;
        const window = this.window;
        this.window = undefined;
        if (window && !window.destroyed) this.ui.close(this.route.id, window);
        else this.ui.close(this.route.id);
    }
}

class UISceneLoadingWindow extends BaseGameWindow<SceneTransitionProgress> {
    private readonly progressWidth: number;

    constructor(private readonly view: UISceneLoading) {
        super(view);
        this.modal = true;
        this.progressWidth = view.progressFill.width;
    }

    setProgress(progress: SceneTransitionProgress): void {
        const overallPercent = toPercent(progress.overall);
        this.view.phaseText.text = PHASE_LABELS[progress.phase];
        this.view.phaseText.color = "#f8fafc";
        this.view.sceneProgressText.text = `场景 ${toPercent(progress.scene)}%`;
        this.view.resourceProgressText.text = `资源 ${toPercent(progress.resources)}%`;
        this.view.percentText.text = `${overallPercent}%`;
        this.view.percentText.color = "#4ade80";
        this.view.progressFill.width = Math.round(this.progressWidth * progress.overall);
    }

    setFailure(progress: SceneTransitionProgress, error: unknown): void {
        this.setProgress(progress);
        const cancelled = error instanceof Error && error.name === "SceneTransitionCancelledError";
        this.view.phaseText.text = cancelled ? "加载已取消" : "加载失败，请重试";
        this.view.phaseText.color = "#f87171";
        this.view.percentText.color = "#f87171";
    }

    protected onBind(progress: SceneTransitionProgress): void {
        this.setProgress(progress);
    }
}

function toPercent(progress: number): number {
    return Math.round(Math.max(0, Math.min(1, progress)) * 100);
}
