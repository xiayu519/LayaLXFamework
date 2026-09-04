import { describe, expect, it } from "vitest";
import { LX } from "../src/framework/LX";
import {
    bindLXRuntime,
    unbindLXRuntime,
} from "../src/framework/bootstrap/LXRuntimeHost";
import type { ApplicationRuntime } from "../src/framework/bootstrap/createRuntime";

function createRuntime(): ApplicationRuntime {
    return {
        ui: { id: "ui" },
        resources: { id: "resources" },
        content: { id: "content" },
        settings: { id: "settings" },
        audio: { id: "audio" },
        scenes: { id: "scenes" },
        http: { id: "http" },
        platform: { id: "platform" },
        purchase: { id: "purchase" },
        bootstrap: { id: "bootstrap", state: "running" },
        start: async () => {},
        stop: async () => {},
    } as unknown as ApplicationRuntime;
}

describe("LX", () => {
    it("exposes the attached runtime through LX.*", () => {
        const runtime = createRuntime();
        bindLXRuntime(runtime);
        try {
            expect(globalThis.LX).toBe(LX);
            expect(LX.Ready).toBe(true);
            expect(LX.App).toBe(runtime);
            expect(LX.UI).toBe(runtime.ui);
            expect(LX.Res).toBe(runtime.resources);
            expect(LX.Audio).toBe(runtime.audio);
            expect(LX.Net).toBe(runtime.http);
            expect(LX.Platform).toBe(runtime.platform);
        } finally {
            unbindLXRuntime(runtime);
        }
        expect(LX.Ready).toBe(false);
        expect(() => LX.UI).toThrow("runtime is not attached");
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
