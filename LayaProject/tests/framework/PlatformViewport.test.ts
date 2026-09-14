import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultPlatformService } from "../../src/framework/platform/createDefaultPlatformService";
import { WeChatMiniGamePlatformService } from "../../src/framework/platform/WeChatMiniGamePlatformService";
import { WebPlatformService } from "../../src/framework/platform/WebPlatformService";

afterEach(() => {
    delete (globalThis as typeof globalThis & { wx?: unknown }).wx;
    vi.unstubAllGlobals();
});

describe("platform viewport", () => {
    it.each([
        { Browser: { onMiniGame: true, onTTMiniGame: true } },
        { Browser: { onMiniGame: true, onWXMiniGame: true } },
        { Browser: {}, LayaEnv: { isConch: true } },
        { Browser: { onLayaRuntime: true } },
    ])("未支持的宿主不能回退 Web：%j", engine => {
        vi.stubGlobal("Laya", engine);
        expect(() => createDefaultPlatformService()).toThrow("ApplicationConfig.platform");
    });

    it("浏览器仍选择 Web，微信窗口信息能力失效时明确拒绝", () => {
        vi.stubGlobal("Laya", { Browser: {} });
        expect(createDefaultPlatformService()).toBeInstanceOf(WebPlatformService);
        vi.stubGlobal("wx", {});
        expect(() => new WeChatMiniGamePlatformService().start()).toThrow("unavailable");
    });

    it("微信真实零尺寸不回退，缺失值才使用屏幕尺寸", () => {
        vi.stubGlobal("wx", { getWindowInfo: () => ({ windowWidth: 0, windowHeight: 0, screenWidth: 390, screenHeight: 844 }) });
        expect(new WeChatMiniGamePlatformService().viewport).toMatchObject({ width: 0, height: 0 });
        vi.stubGlobal("wx", { getSystemInfoSync: () => ({ screenWidth: 390, screenHeight: 844 }) });
        expect(new WeChatMiniGamePlatformService().viewport).toMatchObject({ width: 390, height: 844 });
    });

    it("微信窗口 API 抛错时使用旧接口，不伪造安全区", () => {
        vi.stubGlobal("wx", { getWindowInfo() { throw new Error("SDK unavailable"); },
            getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 844 }) });
        expect(new WeChatMiniGamePlatformService().viewport).toMatchObject({ width: 390, height: 844, safeArea: undefined });
    });

    it("Web 没有可信 CSS 测量时保留未知安全区", () => {
        vi.stubGlobal("Laya", { Browser: { clientWidth: 390, clientHeight: 844, window: {} } });
        vi.stubGlobal("document", undefined);
        const platform = new WebPlatformService();
        platform.start();
        expect(platform.viewport).toEqual({ width: 390, height: 844, safeArea: undefined });
        platform.stop();
    });

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
