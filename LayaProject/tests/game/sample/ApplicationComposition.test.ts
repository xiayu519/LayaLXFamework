import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { HttpTransport } from "../../../src/framework/infrastructure/network/HttpTransport";
import type { PlatformService } from "../../../src/framework/platform/PlatformService";
import type { PurchasePlatform } from "../../../src/framework/platform/purchase/PurchasePlatform";

class FakeGWidget {
    destroyed = false;
    zOrder = 0;
    destroy(): void { this.destroyed = true; }
    findChild(): FakeTextField { return new FakeTextField(); }
}

class FakeTextField extends FakeGWidget {
    text = "";
}

class FakeGWindow extends FakeGWidget {
    contentPane!: FakeGWidget;
    modal = false;
    isShowing = false;
    show(): void { this.isShowing = true; }
    hide(): void { this.isShowing = false; }
    protected onHide(): void {}
}

class FakeTextResource {
    constructor(readonly data: unknown) {}
}

const storage = new Map<string, string>();
const sceneGc = vi.fn();
const clearRes = vi.fn();
const tableBytes = readFileSync(resolve("assets/bootstrap/game/tables/tbtableappconfig.bin"));
const runtimeConfig = JSON.parse(readFileSync(resolve("assets/bootstrap/game/config/runtime.json"), "utf8"));
vi.stubGlobal("Laya", {
    GWidget: FakeGWidget,
    GTextField: FakeTextField,
    GWindow: FakeGWindow,
    GRoot: { inst: { modalLayer: new FakeGWidget() } },
    TextResource: FakeTextResource,
    Loader: { HIERARCHY: "HIERARCHY", BUFFER: "arraybuffer", JSON: "json" },
    loader: {
        load: vi.fn(async (url: string) => {
            if (url === "bootstrap/game/tables/tbtableappconfig.bin") {
                return {
                    data: tableBytes.buffer.slice(tableBytes.byteOffset, tableBytes.byteOffset + tableBytes.byteLength),
                };
            }
            if (url === "bootstrap/game/config/runtime.json") {
                return new FakeTextResource(runtimeConfig);
            }
            if (url === "bootstrap/game/ui/FrameworkStatus.lh") {
                return { create: () => new FakeGWidget() };
            }
            throw new Error(`Unexpected test resource '${url}'.`);
        }),
        clearRes,
    },
    Pool: {
        getPoolBySign: vi.fn(() => []),
        getItem: vi.fn(() => null),
        recover: vi.fn(),
        clearBySign: vi.fn(),
    },
    Scene: { gc: sceneGc },
    timer: { clearAll: vi.fn() },
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

const { LX } = await import("../../../src/framework/LX");
const { createApplication } = await import("../../../src/game/bootstrap/createApplication");
const { createRuntime } = await import("../../../src/framework/bootstrap/createRuntime");

beforeEach(() => {
    sceneGc.mockReset();
    clearRes.mockReset();
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
        expect(LX.Tables.ready).toBe(true);
        expect(LX.Config.ready).toBe(true);
        expect(await LX.Config.load<{ framework: string }>("lx.runtime-config")).toEqual(runtimeConfig);
        expect(LX.Config.ready).toBe(true);
        application.settings.save({
            language: "en-US",
            muted: true,
            musicVolume: 0.25,
            soundVolume: 0.5,
        });

        await application.stop();
        expect(LX.Ready).toBe(false);
        expect(application.tables.ready).toBe(false);
        expect(application.config.ready).toBe(false);
        expect(JSON.parse(storage.get("lx.client-settings") ?? "null").data).toEqual({
            language: "en-US",
            muted: true,
            musicVolume: 0.25,
            soundVolume: 0.5,
        });
        expect(sceneGc).toHaveBeenCalledOnce();
        expect(clearRes).toHaveBeenCalledWith("bootstrap/game/tables/tbtableappconfig.bin");
        expect(clearRes).toHaveBeenCalledWith("bootstrap/game/config/runtime.json");
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
        vi.spyOn(runtime.config, "dispose").mockImplementation(() => { events.push("config"); });
        vi.spyOn(runtime.config, "waitForPendingLoads").mockImplementation(async () => { events.push("pending-config"); });
        sceneGc.mockImplementationOnce(() => { events.push("gc"); });

        await runtime.start();
        await expect(runtime.stop()).rejects.toThrow("service(s) failed to stop");

        expect(events).toEqual([
            "ui", "pending-ui", "ui-retry",
            "pool", "pending-pool", "pool-retry",
            "audio", "config", "pending-config", "gc",
        ]);
        expect(LX.Ready).toBe(false);
    });
});
