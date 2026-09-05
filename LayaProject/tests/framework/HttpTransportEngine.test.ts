import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { LayaHttpTransport, type HttpRequestOptions } from "../../src/framework/infrastructure/network/HttpTransport";

// Run the installed, baseline-checked engine sources. Only XHR is controlled;
// HttpRequest.send/_onLoad/complete and event delivery are the real engine code.
const resolver = await import(pathToFileURL(resolve("tools/layaair.mjs")).href) as {
    resolveLayaRuntime(): { runtimeRoot: string };
};
const sourceMap = JSON.parse(readFileSync(join(
    resolver.resolveLayaRuntime().runtimeRoot, "Resources", "engine", "libs", "laya.core.js.map",
), "utf8")) as { sources: string[]; sourcesContent: string[] };
const engineSources = new Map(sourceMap.sources.map((source, index) => [
    source.split("/").pop()?.replace(/\.ts$/, ""), sourceMap.sourcesContent[index],
]));

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("LayaHttpTransport against Laya 3.4.1 sources", () => {
    it.each([200, 201, 202, 206, 299])("accepts HTTP %i with a JSON response", async (status) => {
        installEngine({ status, text: '{"ok":true}' });
        await expect(new LayaHttpTransport().request("/api", { timeoutMs: 0 }))
            .resolves.toMatchObject({ status, data: { ok: true } });
    });

    it.each([204, 205])("accepts HTTP %i without trying to parse an absent body", async (status) => {
        installEngine({ status, text: "" });
        await expect(new LayaHttpTransport().request("/api", { timeoutMs: 0 }))
            .resolves.toMatchObject({ status, data: null });
    });

    it("accepts HEAD without a body and still rejects an empty JSON GET", async () => {
        installEngine({ status: 200, text: "" });
        const transport = new LayaHttpTransport();
        await expect(transport.request("/api", { method: "HEAD", timeoutMs: 0 }))
            .resolves.toMatchObject({ status: 200, data: null });
        await expect(transport.request("/api", { timeoutMs: 0 }))
            .rejects.toMatchObject({ kind: "parse", status: 200, retryable: false });
    });

    it("classifies malformed JSON separately from an HTTP failure", async () => {
        const requests = installEngine({ status: 200, text: "invalid-json" });
        await expect(new LayaHttpTransport().request("/api", {
            timeoutMs: 0, retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0 },
        })).rejects.toMatchObject({ kind: "parse", status: 200, retryable: false });
        expect(requests).toHaveLength(1);
    });

    it("sets only one Content-Type even when the caller uses lowercase", async () => {
        const requests = installEngine({ status: 200, text: "{}" });
        await new LayaHttpTransport().request("/api", {
            method: "POST", body: { ok: true }, headers: { "content-type": "application/json" }, timeoutMs: 0,
        });
        expect(requests[0].headers).toEqual([["Content-Type", "application/json"]]);
        expect(requests[0].sentBody).toBe('{"ok":true}');
    });

    it("sends only the requested typed-array range as binary bytes", async () => {
        const requests = installEngine({ status: 200, text: "{}" });
        const bytes = new Uint8Array([99, 1, 2, 3, 99]);
        await new LayaHttpTransport().request("/api", {
            method: "POST", body: bytes.subarray(1, 4), timeoutMs: 0,
        });
        expect(requests[0].sentBody).toBeInstanceOf(ArrayBuffer);
        expect(Array.from(new Uint8Array(requests[0].sentBody as ArrayBuffer))).toEqual([1, 2, 3]);
        expect(requests[0].headers).toEqual([["Content-Type", "application/octet-stream"]]);
    });

    it("validates decoded schemas without retrying or exposing sensitive content", async () => {
        const requests = installEngine({ status: 200, text: '{"token":"secret"}' });
        const transport = new LayaHttpTransport();
        const options = { timeoutMs: 0, retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0 } };
        await expect(transport.request("/api", { ...options, validate: () => false }))
            .rejects.toMatchObject({ kind: "schema", status: 200, retryable: false, cause: undefined });
        const error = await transport.request("/api", {
            ...options, validate: () => { throw new Error("secret"); },
        }).catch((cause: unknown) => cause);
        expect(error).toMatchObject({ kind: "schema", cause: undefined });
        expect(String(error)).not.toContain("secret");
        expect(requests).toHaveLength(2);
        await expect(transport.request("/api", {
            ...options, validate: (value) => typeof value === "object" && value !== null,
        })).resolves.toMatchObject({ data: { token: "secret" } });
    });

    it("exposes normalized response headers and preserves text and binary responses", async () => {
        installEngine({ status: 200, text: "raw-text", headers: "Content-Type: text/plain\r\nX-Request-Id: req-1\r\n" });
        const transport = new LayaHttpTransport();
        await expect(transport.request("/api", { responseType: "text", timeoutMs: 0 }))
            .resolves.toMatchObject({ data: "raw-text", headers: { "content-type": "text/plain", "x-request-id": "req-1" } });
        const bytes = new Uint8Array([1, 2]).buffer;
        installEngine({ status: 200, text: "", binary: bytes });
        await expect(transport.request("/api", { responseType: "arraybuffer", timeoutMs: 0 }))
            .resolves.toMatchObject({ data: bytes });
    });

    it("rejects duplicate headers, conflicting idempotency keys and unsupported bodies before dispatch", async () => {
        const requests = installEngine({ status: 200, text: "{}" });
        const transport = new LayaHttpTransport();
        class NativePayload {}
        const invalidOptions: HttpRequestOptions[] = [
            { body: new NativePayload() },
            { headers: { "Content-Type": "application/json", "content-type": "text/plain" } },
            { idempotencyKey: "one", headers: { "idempotency-key": "two" } },
            { headers: { "Invalid Name": "value" } },
        ];
        for (const options of invalidOptions) {
            await expect(transport.request("/api", { ...options, method: "POST", timeoutMs: 0 }))
                .rejects.toMatchObject({ kind: "validation", retryable: false, attempt: 0 });
        }
        expect(requests).toHaveLength(0);
    });

    it("snapshots a POST body and idempotency header across retries", async () => {
        const body = { coins: 3 };
        const headers = { "Idempotency-Key": "operation-1" };
        const requests = installEngine([
            { status: 503, text: "unavailable", onSend: () => { body.coins = 99; headers["Idempotency-Key"] = "changed"; } },
            { status: 201, text: "{}" },
        ]);
        await new LayaHttpTransport().request("/api", {
            method: "POST", body, headers, idempotencyKey: "operation-1", timeoutMs: 0,
            retry: { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0 },
        });
        expect(requests).toHaveLength(2);
        expect(requests.map((request) => request.sentBody)).toEqual(['{"coins":3}', '{"coins":3}']);
        expect(requests[1].headers).toContainEqual(["Idempotency-Key", "operation-1"]);
    });

    it("aborts a timed-out real engine request and clears its native callbacks", async () => {
        vi.useFakeTimers();
        const requests = installEngine({ status: 0, text: "", event: "none" });
        const result = new LayaHttpTransport().request("/api", { timeoutMs: 20 });
        const rejection = expect(result).rejects.toMatchObject({ kind: "timeout", retryable: true });
        await vi.advanceTimersByTimeAsync(20);
        await rejection;
        expect(requests[0].abort).toHaveBeenCalledOnce();
        expect(requests[0].onload).toBeNull();
        expect(requests[0].onabort).toBeNull();
    });

    it("handles caller cancellation and duplicate native completions only once", async () => {
        const requests = installEngine({ status: 0, text: "", event: "none" });
        const controller = new AbortController();
        const pending = new LayaHttpTransport().request("/api", { signal: controller.signal, timeoutMs: 0 });
        const rejection = expect(pending).rejects.toMatchObject({ kind: "abort", retryable: false });
        controller.abort();
        await rejection;
        expect(requests[0].abort).toHaveBeenCalledOnce();
        installEngine({ status: 200, text: "{}", event: "duplicate" });
        const validate = vi.fn(() => true);
        await new LayaHttpTransport().request("/api", { validate, timeoutMs: 0 });
        expect(validate).toHaveBeenCalledOnce();
    });
});

interface ResponsePlan {
    readonly status: number;
    readonly text: string;
    readonly binary?: ArrayBuffer;
    readonly headers?: string;
    readonly event?: "none" | "duplicate";
    readonly onSend?: () => void;
}

function installEngine(plan: ResponsePlan | readonly ResponsePlan[]): ControlledXHR[] {
    const requests: ControlledXHR[] = [];
    const plans = Array.isArray(plan) ? plan : [plan as ResponsePlan];
    class FixtureXHR extends ControlledXHR {
        constructor() {
            super(plans[Math.min(requests.length, plans.length - 1)]);
            requests.push(this);
        }
    }
    vi.stubGlobal("XMLHttpRequest", FixtureXHR);
    class EngineEvent {}
    Object.assign(EngineEvent, { COMPLETE: "complete", ERROR: "error", PROGRESS: "progress", EMPTY: {} });
    const modules = new Map<string, Record<string, unknown>>([
        ["Event", { Event: EngineEvent }],
        ["Browser", { Browser: { onBLMiniGame: false, onAndroid: false } }],
        ["XML", { XML: class XML {} }],
    ]);
    const requireEngine = (path: string): Record<string, unknown> => {
        const name = path.split("/").pop() ?? "";
        const cached = modules.get(name);
        if (cached) return cached;
        const source = engineSources.get(name);
        if (!source) throw new Error(`Missing installed engine source '${name}'.`);
        const exports: Record<string, unknown> = {};
        modules.set(name, exports);
        const output = ts.transpileModule(source, {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
        }).outputText;
        new Function("require", "exports", output)(requireEngine, exports);
        return exports;
    };
    vi.stubGlobal("Laya", { Event: EngineEvent, HttpRequest: requireEngine("HttpRequest").HttpRequest });
    return requests;
}

class ControlledXHR {
    readonly status: number;
    readonly statusText = "Fixture";
    readonly responseText: string;
    readonly response: ArrayBuffer | undefined;
    readonly responseURL = "/api";
    readonly headers: Array<[string, string]> = [];
    sentBody: unknown;
    onload?: (() => void) | null;
    onabort?: (() => void) | null;

    constructor(private readonly plan: ResponsePlan) {
        this.status = plan.status;
        this.responseText = plan.text;
        this.response = plan.binary;
    }

    open(): void {}
    setRequestHeader(key: string, value: string): void { this.headers.push([key, value]); }
    getAllResponseHeaders(): string { return this.plan.headers ?? ""; }
    send(body: unknown): void {
        this.sentBody = body;
        this.plan.onSend?.();
        if (this.plan.event === "none") return;
        const onload = this.onload;
        onload?.();
        if (this.plan.event === "duplicate") onload?.();
    }
    abort = vi.fn((): void => { this.onabort?.(); });
}
