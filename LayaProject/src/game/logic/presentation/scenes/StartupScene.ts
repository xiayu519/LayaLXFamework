import { StartupSceneBase } from "./StartupScene.generated";
import type { BootstrapProgress } from "../../../../framework/application/lifecycle/AppService";
import type { SceneTransitionProgress } from "../../../../framework/presentation/scene/SceneFlow";
import { UILayoutService, type UIHostViewportProvider } from "../../../../framework/presentation/ui/UILayoutService";

const { regClass } = Laya;

const SERVICE_LABELS: Readonly<Record<string, string>> = {
    "laya-graphics-cleanup": "准备渲染环境", "platform:web": "初始化运行平台",
    "platform:wechat-mini-game": "初始化运行平台", "ui-layout": "准备界面适配",
    "resource-cleanup": "准备资源回收", preferences: "读取本地设置",
    "game-initialize": "加载配置表与全局数据",
    "initial-synchronization": "同步初始数据与红点", worlds: "框架初始化完成",
    network: "准备网络模块",
};

/** 只负责展示；由 AppEntry 打开此场景并执行应用初始化。 */
@regClass()
export class StartupScene extends StartupSceneBase {
    /** 创建应用模块前，先打开资源中配置的启动界面。 */
    public static async openStartup(): Promise<StartupScene> {
        const scene = await Laya.Scene.open("bootstrap/scenes/Startup.ls", false);
        if (!(scene instanceof StartupScene)) {
            scene.destroy();
            throw new Error("Startup.ls requires StartupScene Runtime.");
        }
        scene.zOrder = 1;
        // 先让配置好的进度界面完成渲染，再同步创建模块。
        await new Promise<void>(resolve => Laya.timer.frameOnce(2, null, resolve));
        return scene;
    }

    private readonly layout = new UILayoutService({
        get viewport() {
            return { width: Laya.Browser.clientWidth, height: Laya.Browser.clientHeight };
        }
    });
    private platformLayout: UILayoutService | undefined;
    private progressWidth = 0;
    private completed = 0;
    private total = 1;
    private overall = 0;

    public override onOpened(): void {
        this.progressWidth = this.loadingView.progressFill.width;
        this.loadingView.phaseText.text = "正在启动";
        this.loadingView.sceneProgressText.text = "准备初始化框架";
        this.loadingView.resourceProgressText.text = "";
        this.renderProgress(0);
        Laya.stage.on(Laya.Event.RESIZE, this, this.resizeUI);
    }

    public setViewportProvider(provider: UIHostViewportProvider): void {
        if (this.destroyed) {
            return;
        }
        this.platformLayout = new UILayoutService(provider);
        this.resizeUI();
    }

    public readonly onServiceProgress = (progress: BootstrapProgress): void => {
        if (this.destroyed) {
            return;
        }
        this.completed = progress.completed;
        this.total = progress.total;
        this.loadingView.phaseText.text = SERVICE_LABELS[progress.serviceName] ?? "初始化公共服务";
        this.loadingView.sceneProgressText.text = `初始化 ${progress.completed} / ${progress.total}`;
        this.loadingView.resourceProgressText.text = "";
        // 为根 World 就绪后的首次 World 进入预留一个进度项。
        this.renderProgress(progress.completed / (progress.total + 1));
    };
    public readonly onSceneProgress = (progress: SceneTransitionProgress): void => {
        if (this.destroyed) {
            return;
        }
        this.loadingView.phaseText.text = progress.phase === "ready" ? "大厅已就绪" : "正在进入大厅";
        this.loadingView.resourceProgressText.text = `场景 ${Math.round(progress.scene * 100)}%`;
        // World 进入任务成功后，AppEntry 会移除此界面。
        this.renderProgress((this.completed + progress.overall * 0.99) / (this.total + 1));
    };

    public fail(_error: unknown): void {
        if (this.destroyed) {
            return;
        }
        this.loadingView.phaseText.text = "启动失败，请检查错误日志后重新运行";
        this.loadingView.phaseText.color = "#f87171";
        this.loadingView.percentText.color = "#f87171";
        // 初始化失败的应用模块已停止，释放其平台适配器引用。
        this.platformLayout = undefined;
    }

    public override destroy(destroyChild = true): void {
        if (this.destroyed) {
            return;
        }
        Laya.stage.off(Laya.Event.RESIZE, this, this.resizeUI);
        this.platformLayout = undefined;
        super.destroy(destroyChild);
    }

    private renderProgress(value: number): void {
        this.overall = Math.max(this.overall, Math.min(1, value));
        this.loadingView.percentText.text = `${Math.floor(this.overall * 100)}%`;
        this.loadingView.progressFill.width = Math.round(this.progressWidth * this.overall);
        this.resizeUI();
    }

    private resizeUI(): void {
        if (!this.destroyed) {
            (this.platformLayout ?? this.layout).applyView(this.loadingView, "fullscreen");
        }
    }
}
