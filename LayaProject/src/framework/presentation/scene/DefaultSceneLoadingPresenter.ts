import type { BindingToken } from "../../application/ui/AsyncBindingGuard";
import { BaseGameWindow } from "../ui/BaseGameWindow";
import { UILayer } from "../ui/UILayer";
import { UIRouter, type UIRoute } from "../ui/UIRouter";
import type { SceneLoadingPresenter, SceneTransitionPhase, SceneTransitionProgress } from "./SceneFlow";

export const DEFAULT_SCENE_LOADING_ROUTE_ID = "lx.scene-loading";
export const DEFAULT_SCENE_LOADING_URL = "bootstrap/framework/ui/SceneLoading.lh";

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
    private window: SceneLoadingWindow | undefined;
    private generation = 0;

    constructor(private readonly ui: UIRouter) {
        this.route = ui.register({
            id: DEFAULT_SCENE_LOADING_ROUTE_ID,
            url: DEFAULT_SCENE_LOADING_URL,
            layer: UILayer.System,
            modal: true,
            layout: "fullscreen",
            multiplicity: "singleton",
            retention: "hide",
            create: (pane) => new SceneLoadingWindow(pane),
        });
    }

    async show(progress: SceneTransitionProgress): Promise<void> {
        const generation = ++this.generation;
        const window = await this.ui.show(this.route, progress) as SceneLoadingWindow;
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

class SceneLoadingWindow extends BaseGameWindow<SceneTransitionProgress> {
    private readonly phaseText: Laya.GTextField;
    private readonly sceneText: Laya.GTextField;
    private readonly resourceText: Laya.GTextField;
    private readonly percentText: Laya.GTextField;
    private readonly progressFill: Laya.GWidget;
    private readonly progressWidth: number;

    constructor(contentPane: Laya.GWidget) {
        super(contentPane);
        this.modal = true;
        this.phaseText = this.requireChild("phaseText", Laya.GTextField);
        this.sceneText = this.requireChild("sceneProgressText", Laya.GTextField);
        this.resourceText = this.requireChild("resourceProgressText", Laya.GTextField);
        this.percentText = this.requireChild("percentText", Laya.GTextField);
        this.progressFill = this.requireChild("progressFill", Laya.GWidget);
        this.progressWidth = this.progressFill.width;
    }

    setProgress(progress: SceneTransitionProgress): void {
        const overallPercent = toPercent(progress.overall);
        this.phaseText.text = PHASE_LABELS[progress.phase];
        this.phaseText.color = "#f8fafc";
        this.sceneText.text = `场景 ${toPercent(progress.scene)}%`;
        this.resourceText.text = `资源 ${toPercent(progress.resources)}%`;
        this.percentText.text = `${overallPercent}%`;
        this.percentText.color = "#4ade80";
        this.progressFill.width = Math.round(this.progressWidth * progress.overall);
    }

    setFailure(progress: SceneTransitionProgress, error: unknown): void {
        this.setProgress(progress);
        const cancelled = error instanceof Error && error.name === "SceneTransitionCancelledError";
        this.phaseText.text = cancelled ? "加载已取消" : "加载失败，请重试";
        this.phaseText.color = "#f87171";
        this.percentText.color = "#f87171";
    }

    protected onBind(progress: SceneTransitionProgress, token: BindingToken): void {
        token.commit(() => this.setProgress(progress));
    }
}

function toPercent(progress: number): number {
    return Math.round(Math.max(0, Math.min(1, progress)) * 100);
}
