import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { HttpTransport } from "../src/framework/infrastructure/network/HttpTransport";
import type { PlatformService } from "../src/framework/platform/PlatformService";
import type { PurchasePlatform } from "../src/framework/platform/purchase/PurchasePlatform";

class FakeGWidget {
    destroyed = false;
    zOrder = 0;
    destroy(): void { this.destroyed = true; }
}

class FakeGWindow extends FakeGWidget {
    contentPane!: FakeGWidget;
    modal = false;
    isShowing = false;
    show(): void { this.isShowing = true; }
    hide(): void { this.isShowing = false; }
    protected onHide(): void {}
}

const storage = new Map<string, string>();
const sceneGc = vi.fn();
const configBytes = readFileSync(resolve("assets/bootstrap/config/game/tbtableappconfig.bin"));
vi.stubGlobal("Laya", {
    GWidget: FakeGWidget,
    GWindow: FakeGWindow,
    GRoot: { inst: { modalLayer: new FakeGWidget() } },
    Loader: { HIERARCHY: "HIERARCHY", BUFFER: "arraybuffer" },
    loader: {
        load: vi.fn(async (url: string) => {
            if (url !== "bootstrap/config/game/tbtableappconfig.bin") {
                throw new Error(`Unexpected test resource '${url}'.`);
            }
            return {
                data: configBytes.buffer.slice(configBytes.byteOffset, configBytes.byteOffset + configBytes.byteLength),
            };
        }),
    },
    Pool: {
        getPoolBySign: vi.fn(() => []),
        getItem: vi.fn(() => null),
        recover: vi.fn(),
        clearBySign: vi.fn(),
    },
    Scene: { gc: sceneGc },
    LocalStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
    },
    SoundManager: {
        muted: false,
        musicVolume: 1,
        soundVolume: 1,
    },
});

const { LX } = await import("../src/framework/LX");
const { createApplication } = await import("../src/game/bootstrap/createApplication");
const { createRuntime } = await import("../src/framework/bootstrap/createRuntime");

beforeEach(() => {
    sceneGc.mockReset();
});

afterAll(() => vi.unstubAllGlobals());

describe("createApplication", () => {
    it("injects platform boundaries and leaves saved settings unchanged at shutdown", async () => {
        storage.clear();
        const platform: PlatformService = {
            name: "platform:test",
            kind: "native",
            safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
            start: vi.fn(),
            stop: vi.fn(),
            nowMs: () => 0,
            openExternalUrl: vi.fn(),
        };
        const purchase: PurchasePlatform = {
            supported: true,
            purchase: vi.fn(),
            restore: vi.fn(),
        };
        const http = { request: vi.fn() } as unknown as HttpTransport;
        const application = createApplication({ platform, purchase, http });

        expect(application.platform).toBe(platform);
        expect(application.purchase).toBe(purchase);
        expect(application.http).toBe(http);
        await application.start();
        expect(LX.Ready).toBe(true);
        expect(LX.Config.ready).toBe(true);
        application.settings.save({
            language: "en-US",
            muted: true,
            musicVolume: 0.25,
            soundVolume: 0.5,
        });

        await application.stop();
        expect(LX.Ready).toBe(false);
        expect(JSON.parse(storage.get("lx.client-settings") ?? "null").data).toEqual({
            language: "en-US",
            muted: true,
            musicVolume: 0.25,
            soundVolume: 0.5,
        });
        expect(sceneGc).toHaveBeenCalledOnce();
        expect(platform.stop).toHaveBeenCalledOnce();
    });

    it("removes the LX binding when runtime startup fails", async () => {
        const platform: PlatformService = {
            name: "platform:broken",
            kind: "native",
            safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
            start: vi.fn(() => { throw new Error("platform unavailable"); }),
            stop: vi.fn(),
            nowMs: () => 0,
            openExternalUrl: vi.fn(),
        };
        const application = createApplication({ platform });

        await expect(application.start()).rejects.toThrow(
            "Service 'platform:broken' failed to start: platform unavailable",
        );
        expect(LX.Ready).toBe(false);
        expect(() => LX.UI).toThrow("runtime is not attached");
    });

    it("stops game services before the shared Laya resource collection boundary", async () => {
        const events: string[] = [];
        sceneGc.mockImplementationOnce(() => { events.push("gc"); });
        const runtime = createRuntime({
            createServices() {
                return [{
                    name: "game-owner",
                    start(): void {},
                    stop(): void { events.push("game"); },
                }];
            },
        });

        await runtime.start();
        await runtime.stop();
        expect(events).toEqual(["game", "gc"]);
    });

    it("continues every runtime cleanup step after an earlier failure", async () => {
        const runtime = createRuntime({});
        const events: string[] = [];
        vi.spyOn(runtime.ui, "dispose")
            .mockImplementationOnce(() => { events.push("ui"); throw new Error("ui cleanup failed"); })
            .mockImplementation(() => { events.push("ui-retry"); });
        vi.spyOn(runtime.ui, "waitForPendingLoads").mockImplementation(async () => { events.push("pending-ui"); });
        vi.spyOn(runtime.pool, "dispose")
            .mockImplementationOnce(() => { events.push("pool"); })
            .mockImplementation(() => { events.push("pool-retry"); });
        vi.spyOn(runtime.pool, "waitForPendingLoads").mockImplementation(async () => { events.push("pending-pool"); });
        vi.spyOn(runtime.audio, "dispose").mockImplementation(() => { events.push("audio"); });
        sceneGc.mockImplementationOnce(() => { events.push("gc"); });

        await runtime.start();
        await expect(runtime.stop()).rejects.toThrow("service(s) failed to stop");

        expect(events).toEqual([
            "ui", "pending-ui", "ui-retry",
            "pool", "pending-pool", "pool-retry",
            "audio", "gc",
        ]);
        expect(LX.Ready).toBe(false);
    });
});
