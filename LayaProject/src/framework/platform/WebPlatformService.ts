import type { SafeAreaInsets, PlatformService } from "./PlatformService";

const EMPTY_SAFE_AREA: SafeAreaInsets = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

export class WebPlatformService implements PlatformService {
    readonly name = "platform:web";
    readonly kind = "web" as const;

    get safeArea(): SafeAreaInsets {
        return EMPTY_SAFE_AREA;
    }

    start(): void {}

    stop(): void {}

    nowMs(): number {
        return Laya.Browser.window.performance?.now?.() ?? Date.now();
    }

    openExternalUrl(url: string): void {
        const parsed = new URL(url, Laya.Browser.window.location.href);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            throw new Error(`Unsupported external URL protocol '${parsed.protocol}'.`);
        }
        Laya.Browser.window.open(parsed.href, "_blank", "noopener,noreferrer");
    }
}
