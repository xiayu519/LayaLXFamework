import type { PlatformRect, PlatformService, PlatformViewport } from "./PlatformService";

interface WeChatRect {
    readonly left: number;
    readonly top: number;
    readonly right?: number;
    readonly bottom?: number;
    readonly width: number;
    readonly height: number;
}

interface WeChatWindowInfo {
    readonly windowWidth?: number;
    readonly windowHeight?: number;
    readonly screenWidth?: number;
    readonly screenHeight?: number;
    readonly screenTop?: number;
    readonly safeArea?: WeChatRect;
}

interface WeChatApi {
    getWindowInfo?(): WeChatWindowInfo;
    getSystemInfoSync?(): WeChatWindowInfo;
    getMenuButtonBoundingClientRect?(): WeChatRect;
}

export class WeChatMiniGamePlatformService implements PlatformService {
    public readonly name = "platform:wechat-mini-game";
    public readonly kind = "mini-game" as const;

    public static isSupported(): boolean {
        return Boolean(resolveWeChatApi());
    }

    public get viewport(): PlatformViewport {
        const api = this.requireApi();
        const info = tryCall(api.getWindowInfo, api) ?? tryCall(api.getSystemInfoSync, api);
        if (!info) {
            return Object.freeze({ width: 0, height: 0 });
        }
        const width = finiteSize(info.windowWidth ?? info.screenWidth ?? 0);
        const height = finiteSize(info.windowHeight ?? info.screenHeight ?? 0);
        const screenTop = finiteCoordinate(info.screenTop);
        return Object.freeze({
            width,
            height,
            safeArea: normalizeRect(info.safeArea, width, height, screenTop),
            topRightAvoidance: normalizeRect(
                tryCall(api.getMenuButtonBoundingClientRect, api),
                width,
                height,
                screenTop,
            ),
        });
    }

    public start(): void {
        this.requireApi();
    }

    public stop(): void {
    }

    public nowMs(): number {
        return Laya.Browser?.window?.performance?.now?.() ?? globalThis.performance?.now?.() ?? Date.now();
    }

    public openExternalUrl(_url: string): void {
        throw new Error("Opening arbitrary external URLs is unsupported in WeChat Mini Game.");
    }

    private requireApi(): WeChatApi {
        const api = resolveWeChatApi();
        if (!api) {
            throw new Error("WeChat Mini Game API is unavailable.");
        }
        return api;
    }
}

function resolveWeChatApi(): WeChatApi | undefined {
    const value = (globalThis as typeof globalThis & { wx?: unknown }).wx;
    const api = value && typeof value === "object" ? value as WeChatApi : undefined;
    return api && (typeof api.getWindowInfo === "function" || typeof api.getSystemInfoSync === "function")
        ? api : undefined;
}

function normalizeRect(
    value: WeChatRect | undefined,
    viewportWidth: number,
    viewportHeight: number,
    screenTop: number,
): PlatformRect | undefined {
    if (!value || viewportWidth <= 0 || viewportHeight <= 0) {
        return undefined;
    }
    const left = clamp(value.left, 0, viewportWidth);
    const top = clamp(value.top - screenTop, 0, viewportHeight);
    const right = clamp(value.right ?? left + value.width, left, viewportWidth);
    const bottom = clamp(
        value.bottom === undefined ? top + value.height : value.bottom - screenTop,
        top,
        viewportHeight,
    );
    return Object.freeze({ x: left, y: top, width: right - left, height: bottom - top });
}

function finiteSize(value: number): number {
    return Number.isFinite(value) && value > 0 ? value : 0;
}

function finiteCoordinate(value: number | undefined): number {
    return Number.isFinite(value) ? value! : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}

function tryCall<TResult>(method: (() => TResult) | undefined, owner: WeChatApi): TResult | undefined {
    if (typeof method !== "function") {
        return undefined;
    }
    try {
        return method.call(owner);
    } catch {
        return undefined;
    }
}
