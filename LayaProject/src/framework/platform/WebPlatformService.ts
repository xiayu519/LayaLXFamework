import type { PlatformRect, PlatformService, PlatformViewport } from "./PlatformService";

export class WebPlatformService implements PlatformService {
    readonly name = "platform:web";
    readonly kind = "web" as const;
    private safeAreaProbe: HTMLDivElement | undefined;

    get viewport(): PlatformViewport {
        const browser = Laya.Browser;
        const width = finiteSize(browser?.clientWidth ?? globalThis.window?.innerWidth ?? 0);
        const height = finiteSize(browser?.clientHeight ?? globalThis.window?.innerHeight ?? 0);
        return Object.freeze({
            width,
            height,
            safeArea: this.readSafeArea(width, height),
        });
    }

    start(): void {
        const document = Laya.Browser?.window?.document ?? globalThis.document;
        if (!document?.body || this.safeAreaProbe) return;
        enableViewportFitCover(document);
        const probe = document.createElement("div");
        probe.setAttribute("aria-hidden", "true");
        probe.style.cssText = [
            "position:fixed",
            "visibility:hidden",
            "pointer-events:none",
            "inset:0",
            "padding-top:env(safe-area-inset-top, 0px)",
            "padding-right:env(safe-area-inset-right, 0px)",
            "padding-bottom:env(safe-area-inset-bottom, 0px)",
            "padding-left:env(safe-area-inset-left, 0px)",
        ].join(";");
        document.body.appendChild(probe);
        this.safeAreaProbe = probe;
    }

    stop(): void {
        this.safeAreaProbe?.remove();
        this.safeAreaProbe = undefined;
    }

    nowMs(): number {
        return Laya.Browser?.window?.performance?.now?.() ?? globalThis.performance?.now?.() ?? Date.now();
    }

    openExternalUrl(url: string): void {
        const hostWindow = Laya.Browser?.window ?? globalThis.window;
        if (!hostWindow) throw new Error("Browser window is unavailable.");
        const parsed = new URL(url, hostWindow.location.href);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            throw new Error(`Unsupported external URL protocol '${parsed.protocol}'.`);
        }
        hostWindow.open(parsed.href, "_blank", "noopener,noreferrer");
    }

    private readSafeArea(width: number, height: number): PlatformRect {
        const probe = this.safeAreaProbe;
        if (!probe) return freezeRect(0, 0, width, height);
        const style = (Laya.Browser?.window ?? globalThis.window).getComputedStyle(probe);
        const top = cssPixel(style.paddingTop, height);
        const right = cssPixel(style.paddingRight, width);
        const bottom = cssPixel(style.paddingBottom, height);
        const left = cssPixel(style.paddingLeft, width);
        return freezeRect(left, top, Math.max(0, width - left - right), Math.max(0, height - top - bottom));
    }
}

function finiteSize(value: number): number {
    return Number.isFinite(value) && value > 0 ? value : 0;
}

function cssPixel(value: string, limit: number): number {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(limit, parsed)) : 0;
}

function freezeRect(x: number, y: number, width: number, height: number): PlatformRect {
    return Object.freeze({ x, y, width, height });
}

function enableViewportFitCover(document: Document): void {
    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!viewport || /(?:^|,)\s*viewport-fit\s*=/.test(viewport.content)) return;
    viewport.content = `${viewport.content}${viewport.content ? "," : ""}viewport-fit=cover`;
}
