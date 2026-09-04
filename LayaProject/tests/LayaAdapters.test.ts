import { afterEach, describe, expect, it, vi } from "vitest";
import {
    HttpTransportError,
    LayaHttpTransport,
} from "../src/framework/infrastructure/network/HttpTransport";
import { ResourcePolicy } from "../src/framework/infrastructure/resource/ResourcePolicy";
import { LayaSceneDriver } from "../src/framework/infrastructure/scene/LayaSceneDriver";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("LayaHttpTransport", () => {
    it("cleans up and wraps a synchronous dispatch failure", async () => {
        const request = installHttpRequest(() => {
            throw new Error("invalid header");
        });

        const error = await new LayaHttpTransport().request("/api").catch((cause: unknown) => cause);

        expect(error).toBeInstanceOf(HttpTransportError);
        expect((error as HttpTransportError).message).toBe("HTTP request dispatch failed.");
        expect((error as HttpTransportError).cause).toBeInstanceOf(Error);
        expect(request.offAll).toHaveBeenCalledOnce();
    });

    it("validates timeout before constructing an engine request", async () => {
        const constructor = vi.fn();
        vi.stubGlobal("Laya", {
            Event: { COMPLETE: "complete", ERROR: "error" },
            HttpRequest: constructor,
        });

        await expect(new LayaHttpTransport().request("/api", { timeoutMs: Number.NaN }))
            .rejects.toThrow("finite non-negative");
        expect(constructor).not.toHaveBeenCalled();
    });

    it("serializes only JSON-shaped bodies", async () => {
        const sent: unknown[][] = [];
        installHttpRequest((...args: unknown[]) => { sent.push(args); }, true);
        const transport = new LayaHttpTransport();

        await transport.request("/json", { method: "POST", body: { value: 1 }, timeoutMs: 0 });
        class NativePayload { readonly value = 2; }
        const nativePayload = new NativePayload();
        await transport.request("/native", { method: "POST", body: nativePayload, timeoutMs: 0 });

        expect(sent[0][1]).toBe('{"value":1}');
        expect(sent[0][4]).toEqual(["Content-Type", "application/json"]);
        expect(sent[1][1]).toBe(nativePayload);
        expect(sent[1][4]).toEqual([]);
    });
});

describe("LayaSceneDriver", () => {
    it("uses Scene.close so onClosed runs before explicit destruction", () => {
        const events: string[] = [];
        const sceneState = {
            destroyed: false,
            close(): void { events.push("close"); },
            destroy(): void { events.push("destroy"); this.destroyed = true; },
        };
        const scene = sceneState as unknown as Laya.Scene;

        new LayaSceneDriver().close(scene);

        expect(events).toEqual(["close", "destroy"]);
    });

    it("does not destroy twice when close auto-destroys the scene", () => {
        const destroy = vi.fn();
        const sceneState = {
            destroyed: false,
            close(): void { this.destroyed = true; },
            destroy,
        };
        const scene = sceneState as unknown as Laya.Scene;

        new LayaSceneDriver().close(scene);

        expect(destroy).not.toHaveBeenCalled();
    });
});

describe("ResourcePolicy", () => {
    it("releases every tracked group once before collecting unused resources", () => {
        const clearResByGroup = vi.fn();
        const destroyUnusedResources = vi.fn();
        vi.stubGlobal("Laya", {
            Loader: { setGroup: vi.fn(), clearResByGroup },
            Resource: { cpuMemory: 1, gpuMemory: 2, destroyUnusedResources },
        });
        const resources = new ResourcePolicy();
        resources.assign("a.lh", "ui:a");
        resources.assign("b.lh", "ui:b");

        const snapshot = resources.releaseAll();

        expect(clearResByGroup.mock.calls).toEqual([["ui:a"], ["ui:b"]]);
        expect(destroyUnusedResources).toHaveBeenCalledOnce();
        expect(snapshot.trackedGroups).toEqual({});
    });

    it("does not clear a group while a resource owner is active", () => {
        const clearResByGroup = vi.fn();
        vi.stubGlobal("Laya", {
            Loader: { setGroup: vi.fn(), clearResByGroup },
            Resource: { cpuMemory: 1, gpuMemory: 2, destroyUnusedResources: vi.fn() },
        });
        const resources = new ResourcePolicy();
        resources.assign("ui/a.lh", "ui:a");
        const lease = resources.acquire("ui:a");

        expect(resources.releaseGroupIfUnused("ui:a")).toBe(false);
        expect(() => resources.releaseGroup("ui:a")).toThrow("active lease");
        expect(resources.snapshot().activeLeases).toEqual({ "ui:a": 1 });

        lease.release();
        lease.release();
        expect(resources.releaseGroupIfUnused("ui:a")).toBe(true);
        expect(clearResByGroup).toHaveBeenCalledOnce();
    });
});

function installHttpRequest(
    onSend: (...args: unknown[]) => void,
    complete = false,
): { offAll: ReturnType<typeof vi.fn> } {
    const listeners = new Map<string, () => void>();
    const request = {
        data: { ok: true },
        http: { status: 200, abort: vi.fn() },
        once(type: string, _caller: unknown, listener: () => void): void {
            listeners.set(type, listener);
        },
        offAll: vi.fn(),
        send(...args: unknown[]): void {
            onSend(...args);
            if (complete) {
                listeners.get("complete")?.();
            }
        },
    };
    vi.stubGlobal("Laya", {
        Event: { COMPLETE: "complete", ERROR: "error" },
        HttpRequest: function HttpRequest() { return request; },
    });
    return request;
}
