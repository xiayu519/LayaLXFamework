import { afterAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { HttpTransport } from "../src/framework/infrastructure/network/HttpTransport";
import type { PlatformService } from "../src/framework/platform/PlatformService";
import type { PurchasePlatform } from "../src/framework/platform/purchase/PurchasePlatform";

class FakeGWidget {
    destroyed = false;

    destroy(): void {
        this.destroyed = true;
    }
}

class FakeGWindow extends FakeGWidget {
    contentPane!: FakeGWidget;
    modal = false;

    show(): void {}
    hide(): void {}
}

const storage = new Map<string, string>();
const clearResByGroup = vi.fn();
const configBytes = readFileSync(resolve("assets/bootstrap/config/game/tbtableappconfig.bin"));
vi.stubGlobal("Laya", {
    GWidget: FakeGWidget,
    GWindow: FakeGWindow,
    Loader: {
        HIERARCHY: "HIERARCHY",
        BUFFER: "arraybuffer",
        setGroup: vi.fn(),
        clearResByGroup,
    },
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
    Resource: {
        cpuMemory: 0,
        gpuMemory: 0,
        destroyUnusedResources: vi.fn(),
    },
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

afterAll(() => {
    vi.unstubAllGlobals();
});

describe("createApplication", () => {
    it("injects platform boundaries and does not overwrite settings during shutdown", async () => {
        storage.clear();
        clearResByGroup.mockClear();
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

        const stored = JSON.parse(storage.get("lx.client-settings") ?? "null");
        expect(stored.data).toEqual({
            language: "en-US",
            muted: true,
            musicVolume: 0.25,
            soundVolume: 0.5,
        });
        expect(clearResByGroup).toHaveBeenCalledWith("ui:bootstrap");
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

        await expect(application.start()).rejects.toThrow("Service 'platform:broken' failed to start: platform unavailable");

        expect(LX.Ready).toBe(false);
        expect(() => LX.UI).toThrow("runtime is not attached");
    });

    it("stops game services before shared runtime resources", async () => {
        const events: string[] = [];
        clearResByGroup.mockImplementationOnce(() => events.push("resources"));
        const runtime = createRuntime({
            createServices(context) {
                return [{
                    name: "game-owner",
                    start() {
                        context.resources.assign("owned.bin", "owned");
                    },
                    stop() {
                        events.push("game");
                    },
                }];
            },
        });

        await runtime.start();
        await runtime.stop();

        expect(events).toEqual(["game", "resources"]);
    });
});
