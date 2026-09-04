import { afterEach, describe, expect, it, vi } from "vitest";
import {
    HttpTransportError,
    LayaHttpTransport,
} from "../src/framework/infrastructure/network/HttpTransport";

afterEach(() => vi.unstubAllGlobals());

describe("LayaHttpTransport", () => {
    it("cleans up and wraps a synchronous dispatch failure", async () => {
        const request = installHttpRequest(() => { throw new Error("invalid header"); });
        const error = await new LayaHttpTransport().request("/api").catch((cause: unknown) => cause);

        expect(error).toBeInstanceOf(HttpTransportError);
        expect((error as HttpTransportError).message).toBe("HTTP request dispatch failed.");
        expect((error as HttpTransportError).cause).toBeInstanceOf(Error);
        expect(request.offAll).toHaveBeenCalledOnce();
    });

    it("validates timeout before constructing an engine request", async () => {
        const constructor = vi.fn();
        vi.stubGlobal("Laya", { Event: { COMPLETE: "complete", ERROR: "error" }, HttpRequest: constructor });

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

function installHttpRequest(
    onSend: (...args: unknown[]) => void,
    complete = false,
): { offAll: ReturnType<typeof vi.fn> } {
    const listeners = new Map<string, () => void>();
    const request = {
        data: { ok: true },
        http: { status: 200, abort: vi.fn() },
        once(type: string, _caller: unknown, listener: () => void): void { listeners.set(type, listener); },
        offAll: vi.fn(),
        send(...args: unknown[]): void {
            onSend(...args);
            if (complete) listeners.get("complete")?.();
        },
    };
    vi.stubGlobal("Laya", {
        Event: { COMPLETE: "complete", ERROR: "error" },
        HttpRequest: function HttpRequest() { return request; },
    });
    return request;
}
