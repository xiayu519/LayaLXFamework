import { createEngineHttpRequest } from "./EngineHttpRequest";
import { prepareHttpPayload, type PreparedHttpPayload } from "./HttpPayload";

export type HttpMethod = "GET" | "POST" | "HEAD";
export type HttpResponseType = "text" | "json" | "arraybuffer";
export type HttpErrorKind =
    | "validation"
    | "initialization"
    | "abort"
    | "timeout"
    | "network"
    | "http"
    | "parse"
    | "schema"
    | "dispatch";

export interface HttpRetryPolicy {
    /** Total attempts, including the initial request. Range: 1..5. */
    readonly maxAttempts: number;
    /** Range: 0..2_147_483_647. */
    readonly baseDelayMs?: number;
    /** Range: baseDelayMs..2_147_483_647. */
    readonly maxDelayMs?: number;
    readonly jitterRatio?: number;
    readonly statusCodes?: readonly number[];
}

export interface HttpRequestOptions {
    readonly method?: HttpMethod;
    readonly headers?: Readonly<Record<string, string>>;
    /** String, plain JSON object/array, ArrayBuffer, or ArrayBufferView. */
    readonly body?: unknown;
    readonly responseType?: HttpResponseType;
    /** Runs after decoding, including null for JSON HEAD/204/205 responses. */
    readonly validate?: (value: unknown) => boolean;
    /** Range: 0..2_147_483_647. Zero disables the request timeout. */
    readonly timeoutMs?: number;
    readonly signal?: AbortSignal;
    /** Required before POST retries are allowed. Also sent as Idempotency-Key. */
    readonly idempotencyKey?: string;
    /** Retries are disabled unless this policy is present with maxAttempts > 1. */
    readonly retry?: HttpRetryPolicy;
}

export interface HttpResponse<T> {
    readonly url: string;
    readonly status: number;
    readonly data: T;
    /** Lowercase names; only headers exposed by the platform/CORS are available. */
    readonly headers: Readonly<Record<string, string>>;
}

export interface HttpTransport {
    request<T>(url: string, options?: HttpRequestOptions): Promise<HttpResponse<T>>;
}

export class HttpTransportError extends Error {
    constructor(
        message: string,
        readonly url: string,
        readonly status: number,
        readonly kind: HttpErrorKind,
        readonly retryable: boolean,
        readonly attempt: number,
        readonly maxAttempts: number,
        readonly cause?: unknown,
    ) {
        super(message);
        this.name = "HttpTransportError";
    }
}

interface ResolvedRetryPolicy {
    readonly maxAttempts: number;
    readonly baseDelayMs: number;
    readonly maxDelayMs: number;
    readonly jitterRatio: number;
    readonly statusCodes: ReadonlySet<number>;
}

const DEFAULT_RETRY_STATUSES = [408, 425, 429, 500, 502, 503, 504] as const;
const MAX_TIMER_DELAY_MS = 2_147_483_647;

export class LayaHttpTransport implements HttpTransport {
    async request<T>(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
        const method = options.method ?? "GET";
        const timeoutMs = options.timeoutMs ?? 15_000;
        const retry = resolveRetryPolicy(options.retry);
        const validationError = validateRequest(url, method, timeoutMs, options.idempotencyKey, retry);
        if (validationError) {
            throw new HttpTransportError(
                validationError,
                url,
                0,
                "validation",
                false,
                0,
                retry.maxAttempts,
            );
        }
        let payload: PreparedHttpPayload;
        try {
            payload = prepareHttpPayload(options.body, options.headers, options.idempotencyKey);
        } catch (cause) {
            throw new HttpTransportError(
                cause instanceof Error ? cause.message : "HTTP payload validation failed.",
                url, 0, "validation", false, 0, retry.maxAttempts,
            );
        }

        let attempt = 1;
        while (true) {
            try {
                return await this.executeAttempt<T>(url, method, timeoutMs, options, payload, retry, attempt);
            } catch (cause) {
                if (!(cause instanceof HttpTransportError)
                    || !cause.retryable
                    || attempt >= retry.maxAttempts) {
                    throw cause;
                }
                await waitForRetry(retryDelay(retry, attempt), options.signal, url, attempt, retry.maxAttempts);
                attempt += 1;
            }
        }
    }

    private executeAttempt<T>(
        url: string,
        method: HttpMethod,
        timeoutMs: number,
        options: HttpRequestOptions,
        payload: PreparedHttpPayload,
        retry: ResolvedRetryPolicy,
        attempt: number,
    ): Promise<HttpResponse<T>> {
        return new Promise<HttpResponse<T>>((resolve, reject) => {
            let request: Laya.HttpRequest;
            try {
                request = createEngineHttpRequest();
            } catch (cause) {
                reject(new HttpTransportError(
                    "HTTP request initialization failed.",
                    url,
                    0,
                    "initialization",
                    false,
                    attempt,
                    retry.maxAttempts,
                    cause,
                ));
                return;
            }
            let settled = false;
            let timeoutId: ReturnType<typeof setTimeout> | undefined;

            const cleanup = (): void => {
                request.offAll();
                if (timeoutId !== undefined) {
                    clearTimeout(timeoutId);
                }
                options.signal?.removeEventListener("abort", onAbort);
            };
            const fail = (
                message: string,
                kind: HttpErrorKind,
                status: number,
                cause?: unknown,
                abortRequest = false,
            ): void => {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                let finalCause = cause;
                if (abortRequest) {
                    try {
                        request.http?.abort?.();
                    } catch (abortError) {
                        finalCause ??= abortError;
                    }
                }
                reject(new HttpTransportError(
                    message,
                    url,
                    status,
                    kind,
                    isRetryable(kind, status, method, options.idempotencyKey, retry),
                    attempt,
                    retry.maxAttempts,
                    finalCause,
                ));
            };
            const onAbort = (): void => {
                fail("HTTP request aborted.", "abort", Number(request.http?.status ?? 0), undefined, true);
            };
            const onComplete = (): void => {
                if (settled) {
                    return;
                }
                const status = Number(request.http?.status ?? 200);
                if (status !== 0 && (status < 200 || status >= 300)) {
                    fail(`HTTP request failed with status ${status}.`, "http", status);
                    return;
                }
                let data: unknown = request.data;
                if ((options.responseType ?? "json") === "json") {
                    try {
                        data = method === "HEAD" || status === 204 || status === 205
                            ? null
                            : JSON.parse(data as string);
                    } catch {
                        // Native SyntaxError messages can contain response content.
                        fail("HTTP response is not valid JSON.", "parse", status);
                        return;
                    }
                }
                if (options.validate) {
                    let valid = false;
                    try {
                        valid = options.validate(data) === true;
                    } catch {
                        // Validator errors must not leak the response into diagnostics.
                    }
                    if (!valid) {
                        fail("HTTP response failed schema validation.", "schema", status);
                        return;
                    }
                }
                if (settled) return;
                settled = true;
                const headers = readResponseHeaders(request);
                cleanup();
                resolve({ url, status, data: data as T, headers });
            };

            if (options.signal?.aborted) {
                fail("HTTP request aborted before dispatch.", "abort", 0);
                return;
            }

            try {
                request.once(Laya.Event.COMPLETE, this, onComplete);
                request.once(Laya.Event.ERROR, this, (error: unknown) => {
                    const status = Number(request.http?.status ?? 0);
                    fail(
                        status > 0 ? `HTTP request failed with status ${status}.` : "HTTP request failed.",
                        status > 0 ? "http" : "network",
                        status,
                        error,
                    );
                });
                options.signal?.addEventListener("abort", onAbort, { once: true });
                if (timeoutMs > 0) {
                    timeoutId = setTimeout(() => {
                        fail(`HTTP request timed out after ${timeoutMs}ms.`, "timeout", 0, undefined, true);
                    }, timeoutMs);
                }

                request.send(
                    url,
                    payload.body,
                    method.toLowerCase() as "get" | "post" | "head",
                    options.responseType === "arraybuffer" ? "arraybuffer" : "text",
                    payload.headers,
                );
            } catch (cause) {
                fail("HTTP request dispatch failed.", "dispatch", 0, cause);
            }
        });
    }
}

function resolveRetryPolicy(policy?: HttpRetryPolicy): ResolvedRetryPolicy {
    const baseDelayMs = policy?.baseDelayMs ?? 250;
    return {
        maxAttempts: policy?.maxAttempts ?? 1,
        baseDelayMs,
        maxDelayMs: policy?.maxDelayMs ?? Math.max(4_000, baseDelayMs),
        jitterRatio: policy?.jitterRatio ?? 0.2,
        statusCodes: new Set(policy?.statusCodes ?? DEFAULT_RETRY_STATUSES),
    };
}

function validateRequest(
    url: string,
    method: HttpMethod,
    timeoutMs: number,
    idempotencyKey: string | undefined,
    retry: ResolvedRetryPolicy,
): string | undefined {
    if (!url) {
        return "HTTP request url is required.";
    }
    if (method !== "GET" && method !== "POST" && method !== "HEAD") {
        return "HTTP method must be GET, POST, or HEAD.";
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || timeoutMs > MAX_TIMER_DELAY_MS) {
        return `HTTP timeout must be a finite number from 0 to ${MAX_TIMER_DELAY_MS}ms.`;
    }
    if (!Number.isInteger(retry.maxAttempts) || retry.maxAttempts < 1 || retry.maxAttempts > 5) {
        return "HTTP retry maxAttempts must be an integer from 1 to 5.";
    }
    if (!Number.isFinite(retry.baseDelayMs) || retry.baseDelayMs < 0
        || !Number.isFinite(retry.maxDelayMs) || retry.maxDelayMs < retry.baseDelayMs
        || retry.maxDelayMs > MAX_TIMER_DELAY_MS) {
        return `HTTP retry delays must be finite, within 0..${MAX_TIMER_DELAY_MS}ms, and maxDelayMs must cover baseDelayMs.`;
    }
    if (!Number.isFinite(retry.jitterRatio) || retry.jitterRatio < 0 || retry.jitterRatio > 1) {
        return "HTTP retry jitterRatio must be between 0 and 1.";
    }
    if ([...retry.statusCodes].some((status) => !Number.isInteger(status) || status < 400 || status > 599)) {
        return "HTTP retry statusCodes must contain HTTP error status codes from 400 to 599.";
    }
    if (idempotencyKey !== undefined && idempotencyKey.trim().length === 0) {
        return "HTTP idempotencyKey must not be blank.";
    }
    if (method === "POST" && retry.maxAttempts > 1 && !idempotencyKey) {
        return "HTTP POST retries require an explicit idempotencyKey.";
    }
    return undefined;
}

function isRetryable(
    kind: HttpErrorKind,
    status: number,
    method: HttpMethod,
    idempotencyKey: string | undefined,
    retry: ResolvedRetryPolicy,
): boolean {
    const methodAllowsRetry = method === "GET" || method === "HEAD" || Boolean(idempotencyKey);
    if (!methodAllowsRetry) {
        return false;
    }
    return kind === "network" || kind === "timeout" || (kind === "http" && retry.statusCodes.has(status));
}

function retryDelay(policy: ResolvedRetryPolicy, failedAttempt: number): number {
    const exponential = Math.min(policy.maxDelayMs, policy.baseDelayMs * (2 ** (failedAttempt - 1)));
    if (exponential === 0 || policy.jitterRatio === 0) {
        return exponential;
    }
    const spread = exponential * policy.jitterRatio;
    return Math.min(
        policy.maxDelayMs,
        Math.max(0, Math.round(exponential - spread + Math.random() * spread * 2)),
    );
}

function waitForRetry(
    delayMs: number,
    signal: AbortSignal | undefined,
    url: string,
    attempt: number,
    maxAttempts: number,
): Promise<void> {
    if (signal?.aborted) {
        return Promise.reject(new HttpTransportError(
            "HTTP request aborted before retry.", url, 0, "abort", false, attempt, maxAttempts,
        ));
    }
    return new Promise<void>((resolve, reject) => {
        let timeoutId: ReturnType<typeof setTimeout>;
        const onAbort = (): void => {
            clearTimeout(timeoutId);
            signal?.removeEventListener("abort", onAbort);
            reject(new HttpTransportError(
                "HTTP request aborted before retry.", url, 0, "abort", false, attempt, maxAttempts,
            ));
        };
        timeoutId = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, delayMs);
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

function readResponseHeaders(request: Laya.HttpRequest): Readonly<Record<string, string>> {
    const headers: Record<string, string> = Object.create(null);
    let raw: string;
    try {
        raw = request.http?.getAllResponseHeaders?.() ?? "";
    } catch {
        return Object.freeze(headers);
    }
    for (const line of raw.split(/\r?\n/)) {
        const separator = line.indexOf(":");
        if (separator < 1) continue;
        const name = line.slice(0, separator).trim().toLowerCase();
        const value = line.slice(separator + 1).trim();
        headers[name] = headers[name] ? `${headers[name]}, ${value}` : value;
    }
    return Object.freeze(headers);
}
