import { TablesRegistry } from "./application/config/TablesRegistry";
import { logger } from "./application/diagnostics/Logger";
import { DataRegistry } from "./application/data/DataRegistry";
import { WorldRegistry } from "./application/world/WorldRegistry";
import { SceneRegistry } from "./presentation/scene/SceneRegistry";
import { AudioService } from "./infrastructure/audio/AudioService";
import { ContentCatalog } from "./infrastructure/content/ContentCatalog";
import { JsonConfigService } from "./infrastructure/config/JsonConfigService";
import { LayaHttpTransport, type HttpTransport } from "./infrastructure/network/HttpTransport";
import { NetworkService } from "./infrastructure/network/NetworkService";
import { RenderPerformance } from "./infrastructure/performance/RenderPerformance";
import { LayaGraphicsCleanup } from "./infrastructure/performance/LayaGraphicsCleanup";
import { PrefabPoolService } from "./infrastructure/pool/PrefabPoolService";
import { LayaLocalStorageDriver, SaveStore } from "./infrastructure/storage/SaveStore";
import type { PlatformService } from "./platform/PlatformService";
import { createDefaultPlatformService } from "./platform/createDefaultPlatformService";
import type { PurchasePlatform } from "./platform/purchase/PurchasePlatform";
import { UnsupportedPurchasePlatform } from "./platform/purchase/UnsupportedPurchasePlatform";
import { UIRouter } from "./presentation/ui/UIRouter";
import { RedDotStore } from "./presentation/ui/RedDotStore";
import { RedDotBinding } from "./presentation/ui/RedDotBinding";
import { TipQueue } from "./presentation/ui/TipQueue";
import { UILayoutService } from "./presentation/ui/UILayoutService";
import { AppBootstrap } from "./bootstrap/AppBootstrap";
import type { BaseGameScene } from "./presentation/scene/BaseGameScene";
import type { ApplicationConfig } from "./bootstrap/ApplicationConfig";
import { SETTINGS_SCHEMA, type ClientSettings } from "./bootstrap/ClientSettings";
import { ResourceCleanup } from "./bootstrap/ResourceCleanup";
import { WorldScope } from "./bootstrap/WorldScope";
import { FrameworkEvent } from "./bootstrap/FrameworkEvent";

export type { ApplicationConfig } from "./bootstrap/ApplicationConfig";
export { FrameworkEvent } from "./bootstrap/FrameworkEvent";

/** 框架根对象；统一持有各模块，并在 Laya 就绪后集中初始化。 */
class Lx {
    public readonly logger = logger;
    public events!: Laya.EventDispatcher;
    public tables!: TablesRegistry;
    public data!: DataRegistry;
    public worlds!: WorldRegistry<WorldScope>;
    public content!: ContentCatalog;
    public config!: JsonConfigService;
    public audio!: AudioService;
    public pool!: PrefabPoolService;
    public performance!: RenderPerformance;
    public storage!: SaveStore<ClientSettings>;
    public platform!: PlatformService;
    public purchase!: PurchasePlatform;
    public http!: HttpTransport;
    public redDots!: RedDotStore;
    public ui!: UIRouter;
    public scenes!: SceneRegistry;

    private network?: NetworkService;
    private bootstrap?: AppBootstrap;
    private cleanup?: ResourceCleanup;
    private initTask?: Promise<void>;
    private stopTask?: Promise<void>;
    private stopping = false;
    private stopCompleted = true;
    private synchronization: { source?: string; state: "not-required" | "pending" | "ready" | "failed" | "cancelled" } = { state: "not-required" };

    public get res(): typeof Laya.loader {
        return Laya.loader;
    }

    /** 直接返回原生 WebSocket；业务使用 connectByUrl、on、send 等原生方法。 */
    public get net(): Laya.Socket {
        if (!this.network) {
            throw new Error("Framework has not initialized.");
        }
        return this.network.socket;
    }

    public get ready(): boolean {
        return !this.stopping && this.bootstrap?.state === "running";
    }

    /** 唯一初始化入口；重复调用共用当前启动任务。 */
    public init(application: ApplicationConfig): Promise<void> {
        if (this.initTask && !this.stopping) {
            return this.initTask;
        }
        if (this.stopping && (!this.stopCompleted || !this.isClean())) {
            return Promise.reject(new Error("Framework cleanup remains incomplete; initialization cannot restart."));
        }
        this.stopping = false;
        this.stopCompleted = false;
        this.stopTask = undefined;
        this.initTask = Promise.resolve().then(() => this.initialize(application));
        return this.initTask;
    }

    /** 集中创建模块，并在同一处明确初始化顺序。 */
    private async initialize(application: ApplicationConfig): Promise<void> {
        if (this.stopping) {
            throw new Error("Framework initialization was stopped.");
        }
        this.bootstrap = undefined;
        this.cleanup = undefined;
        try {
            const pendingLoadTimeoutMs = application.lifecycle?.pendingLoadTimeoutMs ?? 5_000;
            if (!Number.isFinite(pendingLoadTimeoutMs) || pendingLoadTimeoutMs <= 0
                || pendingLoadTimeoutMs >= (application.lifecycle?.stopTimeoutMs ?? 10_000)) {
                throw new Error("pendingLoadTimeoutMs must be positive and less than stopTimeoutMs.");
            }

            this.cleanup = new ResourceCleanup([
                { name: "worlds", stop: () => this.worlds?.dispose(), drain: async () => { await this.worlds?.waitForPendingLoads(); } },
                { name: "scenes", stop: () => this.scenes?.dispose(), drain: async () => { await this.scenes?.waitForPendingLoads(); } },
                { name: "ui", stop: () => this.ui?.dispose(), drain: async () => { await this.ui?.waitForPendingLoads(); }, retry: () => this.ui?.dispose() },
                { name: "pool", stop: () => this.pool?.dispose(), drain: async () => { await this.pool?.waitForPendingLoads(); }, retry: () => this.pool?.dispose() },
                { name: "audio", stop: () => this.audio?.dispose() },
                { name: "config", stop: () => this.config?.dispose(), drain: async () => { await this.config?.waitForPendingLoads(); } },
                { name: "red-dots", stop: () => this.disposeRedDots() },
                { name: "events", stop: () => this.events?.offAll() },
                { name: "network", stop: () => this.network?.stop() },
            ], pendingLoadTimeoutMs, () => this.bootstrap?.snapshot());

            // 原生对象在这里创建，导入 lx 或打开启动 Loading 时不创建。
            this.events = new Laya.EventDispatcher();
            // 框架自己的监听归根对象持有，关闭时由根清理器统一卸载。
            this.events.on(FrameworkEvent.READY, this, this.onReady);
            this.events.on(FrameworkEvent.STOPPING, this, this.onStopping);
            this.platform = application.platform ?? createDefaultPlatformService();
            this.configureLogStyle();
            this.tables = new TablesRegistry();
            this.data = new DataRegistry(application.data);
            this.worlds = new WorldRegistry(context => new WorldScope(context, this), () => this.ready);
            this.content = new ContentCatalog(application.content ?? []);
            this.config = new JsonConfigService(this.content);
            this.audio = new AudioService();
            this.pool = new PrefabPoolService();
            this.performance = new RenderPerformance();
            this.storage = new SaveStore(new LayaLocalStorageDriver(), SETTINGS_SCHEMA);
            this.purchase = application.purchase ?? new UnsupportedPurchasePlatform();
            this.http = application.http ?? new LayaHttpTransport();
            this.network = new NetworkService();
            this.redDots = new RedDotStore();
            const layout = new UILayoutService(this.platform);
            this.ui = new UIRouter(new TipQueue(this.pool, application.tipPrefabUrl, {}, layout), layout, { redDots: this.redDots });
            this.scenes = new SceneRegistry({
                loadingPresenter: application.createSceneLoadingPresenter?.(this.ui),
                configureScene: scene => this.configureScene(scene),
            });
            this.synchronization = { source: application.synchronization?.source,
                state: application.synchronization ? "pending" : "not-required" };

            // 内部执行器负责进度、取消和逆序回滚。
            // 模块持有关系与完整启动顺序集中在此处，不再交给另一套运行时。
            this.bootstrap = new AppBootstrap([
                new LayaGraphicsCleanup(), this.platform, layout, this.cleanup, this.network,
                { name: "preferences", start: () => this.audio.applySettings(this.storage.load().value), stop() {} },
                { name: "game-initialize", start: async context => {
                    application.register?.();
                    await application.initialize?.(context!.signal);
                }, stop: () => application.dispose?.() },
                { name: "initial-synchronization", start: context => this.synchronize(application.synchronization, context!.signal), stop() {} },
                // 关闭时先退出子 World，再清理全局游戏模型与资源。
                { name: "worlds", start() {}, stop: () => this.worlds.dispose() },
            ], application.lifecycle);

            RedDotBinding.setDefaultStore(this.redDots);
            await this.bootstrap.start();
            if (!this.ready) {
                throw new Error("Framework initialization was stopped.");
            }
            this.events.event(FrameworkEvent.READY);
            // 监听器可能同步请求关闭；此时不能继续进入初始 World。
            if (!this.ready) {
                throw new Error("Framework initialization was stopped.");
            }
            if (application.initialWorld) {
                await this.worlds.enter(application.initialWorld);
            }
        } catch (error) {
            try {
                await this.stop();
            } catch (cleanupError) {
                throw Object.assign(new Error("Framework initialization and cleanup failed."), { errors: [error, cleanupError] });
            }
            throw error;
        }
    }

    public stop(): Promise<void> {
        if (this.stopTask) {
            return this.stopTask;
        }
        if (!this.initTask && !this.bootstrap) {
            return Promise.resolve();
        }
        this.stopping = true;
        this.stopTask = Promise.resolve().then(async () => {
            try {
                await this.bootstrap?.stop();
            } finally {
                if (this.cleanup && !this.cleanup.started) {
                    await this.cleanup.stop();
                }
            }
        }).finally(() => { this.stopCompleted = true; });
        // 先保存共享任务，关闭通知中的重入调用复用同一任务。
        this.events?.event(FrameworkEvent.STOPPING);
        // 通知后立即使子 World 失效；具体事件、UI 和 Scene 仍按各 World 的登记清理。
        void this.worlds?.dispose().catch(() => {});
        return this.stopTask;
    }

    private onReady(): void {
        logger.log("[LX] FRAMEWORK INITIALIZED");
    }

    private onStopping(): void {
        logger.log("[LX] FRAMEWORK STOPPING");
    }

    public snapshot() {
        if (!this.bootstrap || !this.cleanup) {
            throw new Error("Framework has not initialized.");
        }
        return {
            synchronization: { ...this.synchronization }, bootstrap: this.bootstrap.snapshot(),
            ui: this.ui.snapshot(), scenes: this.scenes.snapshot(), worlds: this.worlds.snapshot(),
            pools: this.pool.snapshot(), config: this.config.snapshot(),
            pendingCleanup: this.cleanup.pendingCleanup, gc: this.cleanup.gc,
        };
    }

    private async synchronize(synchronization: ApplicationConfig["synchronization"], signal: AbortSignal): Promise<void> {
        if (!synchronization) {
            return;
        }
        try {
            await synchronization.synchronize(signal);
            signal.throwIfAborted();
            this.synchronization.state = "ready";
        } catch (error) {
            this.synchronization.state = signal.aborted ? "cancelled" : "failed";
            throw error;
        }
    }

    private isClean(): boolean {
        const bootstrap = this.bootstrap?.snapshot();
        if (bootstrap && (bootstrap.state !== "stopped" || bootstrap.activeServices.length || bootstrap.pending.length
            || bootstrap.failedStops.length || bootstrap.lateCleanupErrors) || this.cleanup?.pendingCleanup.length) {
            return false;
        }
        const worlds = this.worlds?.snapshot(), scenes = this.scenes?.snapshot(), ui = this.ui?.snapshot();
        return !worlds?.worlds.length && !worlds?.pendingLoads && !worlds?.cleanupFailures
            && !scenes?.scenes.length && !scenes?.pendingTransitions && !scenes?.cleanupFailures
            && !ui?.nativeLoads && !ui?.pendingRequests.length && !ui?.managed.length && !ui?.cleanupFailures
            && !ui?.tips.active && !ui?.tips.queued
            && !this.pool?.snapshot().some(pool => pool.active || pool.pending || pool.idle || pool.loading || pool.cleanupFailures)
            && !this.config?.snapshot().length;
    }

    private disposeRedDots(): void {
        if (RedDotBinding.defaultStore === this.redDots) {
            RedDotBinding.setDefaultStore(undefined);
        }
        this.redDots?.dispose();
    }

    private configureLogStyle(): void {
        const browser = Laya.Browser;
        const environment = Laya.LayaEnv;
        if (environment?.isConch || this.platform.kind === "native") {
            logger.style = "plain";
        } else if (this.platform.kind === "mini-game") {
            logger.style = browser?.onWXMiniGame && browser.onDevTools ? "css" : "plain";
        } else {
            const inEditor = environment?.isEditor || environment?.isPreview && /\bElectron\//.test(browser?.userAgent ?? "");
            logger.style = inEditor ? "laya-editor" : "css";
        }
    }

    private configureScene(scene: BaseGameScene): void {
        scene.configureUI(() => {
            const root = scene.uiRoot;
            if (!(root instanceof Laya.GWidget) || root.destroyed || !scene.contains(root)) {
                throw new Error("Assign uiRoot to a screen-space GWidget inside this scene in the IDE.");
            }
            return this.ui.createSceneUI(root);
        });
    }
}

export const lx = new Lx();
declare global {
    var lx: Lx;
}
globalThis.lx = lx;
