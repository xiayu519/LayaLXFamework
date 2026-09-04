import { ConfigRegistry } from "../application/config/ConfigRegistry";
import { SceneRouter, type SceneRoute } from "../application/scene/SceneRouter";
import { AudioService, type AudioSettings } from "../infrastructure/audio/AudioService";
import { ContentCatalog, type ContentEntry } from "../infrastructure/content/ContentCatalog";
import { LayaHttpTransport, type HttpTransport } from "../infrastructure/network/HttpTransport";
import { RenderPerformance } from "../infrastructure/performance/RenderPerformance";
import { PrefabPoolService } from "../infrastructure/pool/PrefabPoolService";
import { ResourcePolicy } from "../infrastructure/resource/ResourcePolicy";
import { LayaSceneDriver } from "../infrastructure/scene/LayaSceneDriver";
import { SpineService } from "../infrastructure/spine/SpineService";
import {
    LayaLocalStorageDriver,
    SaveStore,
    type SaveSchema,
} from "../infrastructure/storage/SaveStore";
import type { PlatformService } from "../platform/PlatformService";
import { WebPlatformService } from "../platform/WebPlatformService";
import type { PurchasePlatform } from "../platform/purchase/PurchasePlatform";
import { UnsupportedPurchasePlatform } from "../platform/purchase/UnsupportedPurchasePlatform";
import { UIRouter } from "../presentation/ui/UIRouter";
import { AppBootstrap, type AppService } from "./AppBootstrap";
import { bindLXRuntime, unbindLXRuntime } from "./LXRuntimeHost";

export interface ClientSettings extends AudioSettings {
    readonly language: string;
}

export interface RuntimeContext {
    readonly config: ConfigRegistry;
    readonly content: ContentCatalog;
    readonly resources: ResourcePolicy;
    readonly settings: SaveStore<ClientSettings>;
    readonly audio: AudioService;
    readonly pool: PrefabPoolService;
    readonly spine: SpineService;
    readonly performance: RenderPerformance;
    readonly ui: UIRouter;
    readonly scenes: SceneRouter<Laya.Scene>;
    readonly platform: PlatformService;
    readonly purchase: PurchasePlatform;
    readonly http: HttpTransport;
}

export interface ApplicationRuntime extends RuntimeContext {
    readonly bootstrap: AppBootstrap;
    start(): Promise<void>;
    stop(): Promise<void>;
}

export interface ApplicationAdapters {
    readonly platform?: PlatformService;
    readonly purchase?: PurchasePlatform;
    readonly http?: HttpTransport;
}

export interface ApplicationDefinition {
    readonly content?: readonly ContentEntry[];
    readonly scenes?: readonly SceneRoute[];
    configureUI?(ui: UIRouter, content: ContentCatalog): void;
    createServices?(context: RuntimeContext): readonly AppService[];
}

const SETTINGS_SCHEMA: SaveSchema<ClientSettings> = {
    key: "lx.client-settings",
    currentVersion: 1,
    createDefault: () => ({
        language: "zh-CN",
        muted: false,
        musicVolume: 1,
        soundVolume: 1,
    }),
    validate(value: unknown): value is ClientSettings {
        if (!value || typeof value !== "object") {
            return false;
        }
        const item = value as Partial<ClientSettings>;
        return typeof item.language === "string"
            && typeof item.muted === "boolean"
            && isVolume(item.musicVolume)
            && isVolume(item.soundVolume);
    },
};

export function createRuntime(
    definition: ApplicationDefinition,
    adapters: ApplicationAdapters = {},
): ApplicationRuntime {
    const config = new ConfigRegistry();
    const content = new ContentCatalog(definition.content ?? []);
    const resources = new ResourcePolicy();
    const audio = new AudioService(resources);
    const pool = new PrefabPoolService(resources);
    const spine = new SpineService(resources);
    const performance = new RenderPerformance();
    const settings = new SaveStore(new LayaLocalStorageDriver(), SETTINGS_SCHEMA);
    const platform = adapters.platform ?? new WebPlatformService();
    const purchase = adapters.purchase ?? new UnsupportedPurchasePlatform();
    const http = adapters.http ?? new LayaHttpTransport();
    const scenes = new SceneRouter<Laya.Scene>(definition.scenes ?? [], new LayaSceneDriver());
    const ui = new UIRouter(resources);

    definition.configureUI?.(ui, content);

    const context: RuntimeContext = {
        config,
        content,
        resources,
        settings,
        audio,
        pool,
        spine,
        performance,
        ui,
        scenes,
        platform,
        purchase,
        http,
    };
    const preferencesService: AppService = {
        name: "preferences",
        start(): void {
            audio.applySettings(settings.load().value);
        },
        stop(): void {},
    };
    const cleanupService: AppService = {
        name: "runtime-resources",
        start(): void {},
        async stop(): Promise<void> {
            ui.dispose();
            await ui.waitForPendingLoads();
            pool.dispose();
            spine.dispose();
            audio.dispose();
            resources.releaseAll();
        },
    };
    const gameServices = definition.createServices?.(context) ?? [];
    const bootstrap = new AppBootstrap([platform, cleanupService, preferencesService, ...gameServices]);

    let runtime: ApplicationRuntime;
    runtime = {
        ...context,
        bootstrap,
        async start(): Promise<void> {
            bindLXRuntime(runtime);
            try {
                await bootstrap.start();
            } catch (error) {
                unbindLXRuntime(runtime);
                throw error;
            }
        },
        async stop(): Promise<void> {
            try {
                await bootstrap.stop();
            } finally {
                unbindLXRuntime(runtime);
            }
        },
    };
    return runtime;
}

function isVolume(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
