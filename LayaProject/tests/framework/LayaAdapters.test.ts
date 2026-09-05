import { afterEach, describe, expect, it, vi } from "vitest";
import {
    HttpTransportError,
    LayaHttpTransport,
} from "../../src/framework/infrastructure/network/HttpTransport";

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("LayaHttpTransport", () => {
    it("cleans up and classifies a synchronous dispatch failure", async () => {
        const fixture = installHttpRequests([{ dispatchError: new Error("invalid header") }]);
        const error = await new LayaHttpTransport().request("/api").catch((cause: unknown) => cause);

        expect(error).toBeInstanceOf(HttpTransportError);
        expect(error).toMatchObject({
            message: "HTTP request dispatch failed.",
            kind: "dispatch",
            retryable: false,
            attempt: 1,
            maxAttempts: 1,
        });
        expect((error as HttpTransportError).cause).toBeInstanceOf(Error);
        expect(fixture.requests[0].offAll).toHaveBeenCalledOnce();
    });

    it("validates options before constructing an engine request", async () => {
        const constructor = vi.fn();
        vi.stubGlobal("Laya", { Event: { COMPLETE: "complete", ERROR: "error" }, HttpRequest: constructor });

        const invalidTimeout = new LayaHttpTransport().request("/api", { timeoutMs: Number.NaN });
        await expect(invalidTimeout).rejects.toMatchObject({ kind: "validation", attempt: 0 });
        const unsafePost = new LayaHttpTransport().request("/api", {
            method: "POST",
            retry: { maxAttempts: 2 },
        });
        await expect(unsafePost).rejects.toThrow("idempotencyKey");
        expect(constructor).not.toHaveBeenCalled();
    });

    it("serializes only JSON-shaped bodies", async () => {
        const fixture = installHttpRequests([{ event: "complete" }, { event: "complete" }]);
        const transport = new LayaHttpTransport();

        await transport.request("/json", { method: "POST", body: { value: 1 }, timeoutMs: 0 });
        class NativePayload { readonly value = 2; }
        const nativePayload = new NativePayload();
        await transport.request("/native", { method: "POST", body: nativePayload, timeoutMs: 0 });

        expect(fixture.sent[0][1]).toBe('{"value":1}');
        expect(fixture.sent[0][4]).toEqual(["Content-Type", "application/json"]);
        expect(fixture.sent[1][1]).toBe(nativePayload);
        expect(fixture.sent[1][4]).toEqual([]);
    });

    it("retries retryable GET failures up to the configured ceiling", async () => {
        const fixture = installHttpRequests([
            { event: "error", status: 0 },
            { event: "complete", status: 503 },
            { event: "complete", status: 200, data: { ok: true } },
        ]);

        const response = await new LayaHttpTransport().request<{ ok: boolean }>("/retry", {
            timeoutMs: 0,
            retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, jitterRatio: 0 },
        });

        expect(response.data.ok).toBe(true);
        expect(fixture.requests).toHaveLength(3);
        expect(fixture.requests.every((request) => request.offAll.mock.calls.length === 1)).toBe(true);
    });

    it("reports the terminal retryable error with attempt metadata", async () => {
        installHttpRequests([
            { event: "complete", status: 503 },
            { event: "complete", status: 503 },
        ]);

        const error = await new LayaHttpTransport().request("/retry", {
            timeoutMs: 0,
            retry: { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0 },
        }).catch((cause: unknown) => cause);

        expect(error).toMatchObject({
            kind: "http",
            status: 503,
            retryable: true,
            attempt: 2,
            maxAttempts: 2,
        });
    });

    it("adds an idempotency key before allowing POST retries", async () => {
        const fixture = installHttpRequests([
            { event: "error", status: 0 },
            { event: "complete", status: 200 },
        ]);

        await new LayaHttpTransport().request("/grant", {
            method: "POST",
            idempotencyKey: "operation-42",
            retry: { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0 },
            timeoutMs: 0,
        });

        expect(fixture.sent).toHaveLength(2);
        expect(fixture.sent[0][4]).toEqual(["Idempotency-Key", "operation-42"]);
    });

    it("aborts a timed-out engine request and classifies the error", async () => {
        vi.useFakeTimers();
        const fixture = installHttpRequests([{ event: "none" }]);
        const pending = new LayaHttpTransport().request("/slow", { timeoutMs: 20 });
        const rejection = expect(pending).rejects.toMatchObject({ kind: "timeout", retryable: true });

        await vi.advanceTimersByTimeAsync(20);

        await rejection;
        expect(fixture.requests[0].http.abort).toHaveBeenCalledOnce();
        expect(fixture.requests[0].offAll).toHaveBeenCalledOnce();
    });

    it("does not retry an explicit caller cancellation", async () => {
        const fixture = installHttpRequests([{ event: "none" }]);
        const controller = new AbortController();
        const pending = new LayaHttpTransport().request("/cancel", {
            signal: controller.signal,
            timeoutMs: 0,
            retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0 },
        });
        const rejection = expect(pending).rejects.toMatchObject({
            kind: "abort",
            retryable: false,
            attempt: 1,
        });

        controller.abort();

        await rejection;
        expect(fixture.requests).toHaveLength(1);
        expect(fixture.requests[0].http.abort).toHaveBeenCalledOnce();
    });
});

interface RequestPlan {
    readonly event?: "complete" | "error" | "none";
    readonly status?: number;
    readonly data?: unknown;
    readonly dispatchError?: Error;
}

function installHttpRequests(plans: readonly RequestPlan[]): {
    requests: Array<{ offAll: ReturnType<typeof vi.fn>; http: { status: number; abort: ReturnType<typeof vi.fn> } }>;
    sent: unknown[][];
} {
    const requests: Array<{
        offAll: ReturnType<typeof vi.fn>;
        http: { status: number; abort: ReturnType<typeof vi.fn> };
    }> = [];
    const sent: unknown[][] = [];
    let nextPlan = 0;

    vi.stubGlobal("Laya", {
        Event: { COMPLETE: "complete", ERROR: "error" },
        HttpRequest: function HttpRequest() {
            const plan = plans[nextPlan++] ?? { event: "none" };
            const listeners = new Map<string, (value?: unknown) => void>();
            const request = {
                data: plan.data ?? { ok: true },
                http: { status: plan.status ?? 200, abort: vi.fn() },
                once(type: string, _caller: unknown, listener: (value?: unknown) => void): void {
                    listeners.set(type, listener);
                },
                offAll: vi.fn(),
                send(...args: unknown[]): void {
                    sent.push(args);
                    if (plan.dispatchError) {
                        throw plan.dispatchError;
                    }
                    if (plan.event === "complete") {
                        listeners.get("complete")?.();
                    } else if (plan.event === "error") {
                        listeners.get("error")?.(new Error("network"));
                    }
                },
            };
            requests.push(request);
            return request;
        },
    });
    return { requests, sent };
}
