import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultPlatformService } from "../../src/framework/platform/createDefaultPlatformService";
import { WeChatMiniGamePlatformService } from "../../src/framework/platform/WeChatMiniGamePlatformService";

afterEach(() => {
    delete (globalThis as typeof globalThis & { wx?: unknown }).wx;
    vi.unstubAllGlobals();
});

describe("platform viewport", () => {
    it("normalizes WeChat safe and capsule rectangles into window coordinates", () => {
        vi.stubGlobal("Laya", { Browser: { window: { performance: globalThis.performance } } });
        (globalThis as typeof globalThis & { wx?: unknown }).wx = {
            getWindowInfo: () => ({
                windowWidth: 390,
                windowHeight: 780,
                screenTop: 24,
                safeArea: { left: 0, top: 68, right: 390, bottom: 770, width: 390, height: 702 },
            }),
            getMenuButtonBoundingClientRect: () => ({
                left: 286, top: 72, right: 378, bottom: 104, width: 92, height: 32,
            }),
        };

        const platform = new WeChatMiniGamePlatformService();
        platform.start();
        expect(platform.viewport).toEqual({
            width: 390,
            height: 780,
            safeArea: { x: 0, y: 44, width: 390, height: 702 },
            topRightAvoidance: { x: 286, y: 48, width: 92, height: 32 },
        });
        expect(createDefaultPlatformService()).toBeInstanceOf(WeChatMiniGamePlatformService);
    });

    it("keeps missing host geometry distinct from a real zero inset", () => {
        vi.stubGlobal("Laya", { Browser: { window: { performance: globalThis.performance } } });
        (globalThis as typeof globalThis & { wx?: unknown }).wx = {
            getWindowInfo: () => ({ windowWidth: 375, windowHeight: 812 }),
        };

        expect(new WeChatMiniGamePlatformService().viewport).toEqual({
            width: 375,
            height: 812,
            safeArea: undefined,
            topRightAvoidance: undefined,
        });
    });
});
