import { TablesRegistry } from "../application/config/TablesRegistry";
import { AudioService, type AudioSettings } from "../infrastructure/audio/AudioService";
import { ContentCatalog, type ContentEntry } from "../infrastructure/content/ContentCatalog";
import { JsonConfigService } from "../infrastructure/config/JsonConfigService";
import { LayaHttpTransport, type HttpTransport } from "../infrastructure/network/HttpTransport";
import { RenderPerformance } from "../infrastructure/performance/RenderPerformance";
import { PrefabPoolService } from "../infrastructure/pool/PrefabPoolService";
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
import { TipQueue } from "../presentation/ui/TipQueue";
import { AppBootstrap, type AppService } from "./AppBootstrap";
import { bindLXRuntime, unbindLXRuntime } from "./LXRuntimeHost";

export interface ClientSettings extends AudioSettings {
    readonly language: string;
}

export interface RuntimeContext {
    readonly tables: TablesRegistry;
    readonly config: JsonConfigService;
    readonly content: ContentCatalog;
    readonly settings: SaveStore<ClientSettings>;
    readonly audio: AudioService;
    readonly pool: PrefabPoolService;
    readonly performance: RenderPerformance;
    readonly ui: UIRouter;
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
    const tables = new TablesRegistry();
    const content = new ContentCatalog(definition.content ?? []);
    const config = new JsonConfigService(content);
    const audio = new AudioService();
    const pool = new PrefabPoolService();
    const performance = new RenderPerformance();
    const settings = new SaveStore(new LayaLocalStorageDriver(), SETTINGS_SCHEMA);
    const platform = adapters.platform ?? new WebPlatformService();
    const purchase = adapters.purchase ?? new UnsupportedPurchasePlatform();
    const http = adapters.http ?? new LayaHttpTransport();
    const tips = new TipQueue(pool, "bootstrap/ui/common/Tip.lh");
    const ui = new UIRouter(tips);

    definition.configureUI?.(ui, content);

    const context: RuntimeContext = {
        tables,
        config,
        content,
        settings,
        audio,
        pool,
        performance,
        ui,
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
        name: "runtime-cleanup",
        start(): void {},
        async stop(): Promise<void> {
            const errors: unknown[] = [];
            await collectCleanup(errors, () => ui.dispose());
            await collectCleanup(errors, () => ui.waitForPendingLoads());
            await collectCleanup(errors, () => ui.dispose());
            await collectCleanup(errors, () => pool.dispose());
            await collectCleanup(errors, () => pool.waitForPendingLoads());
            await collectCleanup(errors, () => pool.dispose());
            await collectCleanup(errors, () => audio.dispose());
            await collectCleanup(errors, () => config.dispose());
            await collectCleanup(errors, () => config.waitForPendingLoads());
            await collectCleanup(errors, () => Laya.Scene.gc());
            if (errors.length > 0) {
                throw new RuntimeCleanupError(errors);
            }
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

class RuntimeCleanupError extends Error {
    constructor(readonly errors: readonly unknown[]) {
        super(`${errors.length} runtime cleanup operation(s) failed.`);
        this.name = "RuntimeCleanupError";
    }
}

async function collectCleanup(
    errors: unknown[],
    action: () => unknown | Promise<unknown>,
): Promise<void> {
    try {
        await action();
    } catch (error) {
        errors.push(error);
    }
}
