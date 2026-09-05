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
import { AppBootstrap, type AppService, type BootstrapOptions } from "./AppBootstrap";
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
    snapshot(): RuntimeSnapshot;
}

export interface RuntimeSnapshot {
    readonly bootstrap: ReturnType<AppBootstrap["snapshot"]>;
    readonly ui: ReturnType<UIRouter["snapshot"]>;
    readonly pools: ReturnType<PrefabPoolService["snapshot"]>;
    readonly config: ReturnType<JsonConfigService["snapshot"]>;
    readonly pendingCleanup: readonly string[];
    readonly gc: "not-requested" | "requested" | "skipped";
}

export interface ApplicationAdapters {
    readonly platform?: PlatformService;
    readonly purchase?: PurchasePlatform;
    readonly http?: HttpTransport;
}

export interface ApplicationDefinition {
    readonly lifecycle?: BootstrapOptions & { readonly pendingLoadTimeoutMs?: number };
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
    const pendingLoadTimeoutMs = definition.lifecycle?.pendingLoadTimeoutMs ?? 5_000;
    if (!Number.isFinite(pendingLoadTimeoutMs) || pendingLoadTimeoutMs <= 0
        || pendingLoadTimeoutMs >= (definition.lifecycle?.stopTimeoutMs ?? 10_000)) {
        throw new Error("pendingLoadTimeoutMs must be positive and less than stopTimeoutMs.");
    }
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
    const tips = new TipQueue(pool, "bootstrap/framework/ui/Tip.lh");
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
    const pendingCleanup = new Set<string>();
    let gc: RuntimeSnapshot["gc"] = "not-requested";
    const cleanupService: AppService = {
        name: "runtime-cleanup",
        start(): void {},
        async stop(): Promise<void> {
            const errors: unknown[] = [];
            let safeToCollect = true;
            await collectCleanup(errors, () => ui.dispose());
            await collectCleanup(errors, () => pool.dispose());
            if (!await collectCleanup(errors, () => audio.dispose())) safeToCollect = false;
            if (!await collectCleanup(errors, () => config.dispose())) safeToCollect = false;
            const waits = [
                ["ui", () => ui.waitForPendingLoads()],
                ["pool", () => pool.waitForPendingLoads()],
                ["config", () => config.waitForPendingLoads()],
            ] as const;
            const settling = Promise.all(waits.map(async ([name, wait]) => {
                pendingCleanup.add(name);
                try { await wait(); } finally { pendingCleanup.delete(name); }
            }));
            if (!await collectCleanup(errors, () => waitWithDeadline(settling, pendingLoadTimeoutMs))) {
                safeToCollect = false;
            }
            if (!await collectCleanup(errors, () => ui.dispose())) safeToCollect = false;
            if (!await collectCleanup(errors, () => pool.dispose())) safeToCollect = false;
            const state = bootstrap.snapshot();
            if (state.pending.some((operation) => operation.serviceName !== "runtime-cleanup")
                || state.failedStops.length > 0 || state.lateCleanupErrors > 0) {
                safeToCollect = false;
                errors.push(new Error("Service operations remain incomplete; resource GC was skipped."));
            }
            gc = safeToCollect ? "requested" : "skipped";
            if (safeToCollect) await collectCleanup(errors, () => Laya.Scene.gc());
            if (errors.length > 0) {
                throw new RuntimeCleanupError([...errors], [...pendingCleanup]);
            }
        },
    };
    const gameServices = definition.createServices?.(context) ?? [];
    const bootstrap = new AppBootstrap([platform, cleanupService, preferencesService, ...gameServices], definition.lifecycle);

    let runtime: ApplicationRuntime;
    runtime = {
        ...context,
        bootstrap,
        snapshot(): RuntimeSnapshot {
            return Object.freeze({ bootstrap: bootstrap.snapshot(), ui: ui.snapshot(),
                pools: pool.snapshot(), config: config.snapshot(), pendingCleanup: [...pendingCleanup], gc });
        },
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
    constructor(readonly errors: readonly unknown[], readonly pending: readonly string[]) {
        super(`${errors.length} runtime cleanup operation(s) failed.`);
        this.name = "RuntimeCleanupError";
    }
}

async function collectCleanup(
    errors: unknown[],
    action: () => unknown | Promise<unknown>,
): Promise<boolean> {
    try {
        await action();
        return true;
    } catch (error) {
        errors.push(error);
        return false;
    }
}

async function waitWithDeadline(operation: Promise<unknown>, timeoutMs: number): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        await Promise.race([operation, new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Runtime pending loads exceeded ${timeoutMs}ms; GC skipped.`)), timeoutMs);
        })]);
    } finally {
        clearTimeout(timer);
    }
}
