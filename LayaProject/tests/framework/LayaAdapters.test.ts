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

        const invalidOptions = [
            { timeoutMs: Number.NaN },
            { timeoutMs: 2_147_483_648 },
            { retry: { maxAttempts: 2, baseDelayMs: 2_147_483_648, maxDelayMs: 2_147_483_648 } },
            { retry: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 2_147_483_648 } },
        ] as const;
        for (const options of invalidOptions) {
            await expect(new LayaHttpTransport().request("/api", options))
                .rejects.toMatchObject({ kind: "validation", attempt: 0 });
        }
        const unsafePost = new LayaHttpTransport().request("/api", {
            method: "POST",
            retry: { maxAttempts: 2 },
        });
        await expect(unsafePost).rejects.toThrow("idempotencyKey");
        expect(constructor).not.toHaveBeenCalled();
    });

    it("accepts the host timer ceiling", async () => {
        const timer = vi.spyOn(globalThis, "setTimeout");
        installHttpRequests([{ event: "complete" }]);
        await new LayaHttpTransport().request("/api", { timeoutMs: 2_147_483_647 });
        expect(timer).toHaveBeenCalledWith(expect.any(Function), 2_147_483_647);
        timer.mockRestore();
    });

    it("keeps retry jitter within maxDelayMs", async () => {
        vi.useFakeTimers();
        const fixture = installHttpRequests([
            { event: "error", status: 0 },
            { event: "complete", status: 200, data: { ok: true } },
        ]);
        const random = vi.spyOn(Math, "random").mockReturnValue(1);
        const response = new LayaHttpTransport().request("/retry", {
            timeoutMs: 0,
            retry: { maxAttempts: 2, baseDelayMs: 10, maxDelayMs: 10, jitterRatio: 1 },
        });
        await vi.advanceTimersByTimeAsync(9);
        expect(fixture.requests).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(1);
        await expect(response).resolves.toMatchObject({ data: { ok: true } });
        expect(fixture.requests).toHaveLength(2);
        random.mockRestore();
    });

    it("serializes JSON and snapshots binary bodies before passing them to Laya", async () => {
        const fixture = installHttpRequests([{ event: "complete" }, { event: "complete" }]);
        const transport = new LayaHttpTransport();

        await transport.request("/json", { method: "POST", body: { value: 1 }, timeoutMs: 0 });
        const binary = new Uint8Array([1, 2]);
        await transport.request("/binary", { method: "POST", body: binary, timeoutMs: 0 });

        expect(fixture.sent[0][1]).toBe('{"value":1}');
        expect(fixture.sent[0][4]).toEqual(["Content-Type", "application/json"]);
        expect(fixture.sent[1][1]).toBeInstanceOf(ArrayBuffer);
        expect(Array.from(new Uint8Array(fixture.sent[1][1] as ArrayBuffer))).toEqual([1, 2]);
        expect(fixture.sent[1][4]).toEqual(["Content-Type", "application/octet-stream"]);
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
                data: JSON.stringify(plan.data ?? { ok: true }),
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
