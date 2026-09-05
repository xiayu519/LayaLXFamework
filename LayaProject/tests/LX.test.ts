import { afterAll, describe, expect, it, vi } from "vitest";
import { LX } from "../src/framework/LX";
import { bindLXRuntime, unbindLXRuntime } from "../src/framework/bootstrap/LXRuntimeHost";
import type { ApplicationRuntime } from "../src/framework/bootstrap/createRuntime";

const loader = { id: "laya-loader" };
class FakeScene {}
vi.stubGlobal("Laya", { loader, Scene: FakeScene });

afterAll(() => vi.unstubAllGlobals());

function createRuntime(): ApplicationRuntime {
    return {
        ui: { id: "ui" },
        content: { id: "content" },
        config: { id: "config" },
        tables: { id: "tables" },
        settings: { id: "settings" },
        audio: { id: "audio" },
        pool: { id: "pool" },
        performance: { id: "performance" },
        http: { id: "http" },
        platform: { id: "platform" },
        purchase: { id: "purchase" },
        bootstrap: { id: "bootstrap", state: "running" },
        start: async () => {},
        stop: async () => {},
    } as unknown as ApplicationRuntime;
}

describe("LX", () => {
    it("exposes framework services and exact Laya loader/scene entry points", () => {
        const runtime = createRuntime();
        bindLXRuntime(runtime);
        try {
            expect(globalThis.LX).toBe(LX);
            expect(LX.Ready).toBe(true);
            expect(LX.UI).toBe(runtime.ui);
            expect(LX.Res).toBe(loader);
            expect(LX.Scene).toBe(FakeScene);
            expect(LX.Audio).toBe(runtime.audio);
            expect(LX.Config).toBe(runtime.config);
            expect(LX.Tables).toBe(runtime.tables);
            expect(LX.Net).toBe(runtime.http);
            expect("App" in LX).toBe(false);
            expect("Spine" in LX).toBe(false);
        } finally {
            unbindLXRuntime(runtime);
        }
        expect(LX.Ready).toBe(false);
        expect(() => LX.Res).toThrow("runtime is not attached");
    });

    it("rejects a second runtime until the first is detached", () => {
        const first = createRuntime();
        const second = createRuntime();
        bindLXRuntime(first);
        try {
            expect(() => bindLXRuntime(second)).toThrow("already has an attached runtime");
        } finally {
            unbindLXRuntime(first);
        }
    });
});
