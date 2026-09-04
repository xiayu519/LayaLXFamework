export type HttpMethod = "GET" | "POST" | "HEAD";
export type HttpResponseType = "text" | "json" | "arraybuffer";
export type HttpErrorKind =
    | "validation"
    | "initialization"
    | "abort"
    | "timeout"
    | "network"
    | "http"
    | "dispatch";

export interface HttpRetryPolicy {
    /** Total attempts, including the initial request. Range: 1..5. */
    readonly maxAttempts: number;
    readonly baseDelayMs?: number;
    readonly maxDelayMs?: number;
    readonly jitterRatio?: number;
    readonly statusCodes?: readonly number[];
}

export interface HttpRequestOptions {
    readonly method?: HttpMethod;
    readonly headers?: Readonly<Record<string, string>>;
    readonly body?: unknown;
    readonly responseType?: HttpResponseType;
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

        let attempt = 1;
        while (true) {
            try {
                return await this.executeAttempt<T>(url, method, timeoutMs, options, retry, attempt);
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
        retry: ResolvedRetryPolicy,
        attempt: number,
    ): Promise<HttpResponse<T>> {
        return new Promise<HttpResponse<T>>((resolve, reject) => {
            let request: Laya.HttpRequest;
            try {
                request = new Laya.HttpRequest();
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
                if (status >= 400) {
                    fail(`HTTP request failed with status ${status}.`, "http", status);
                    return;
                }
                settled = true;
                const data = request.data as T;
                cleanup();
                resolve({ url, status, data });
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

                const headers = flattenHeaders(options.headers);
                if (options.idempotencyKey && !hasHeader(options.headers, "idempotency-key")) {
                    headers.push("Idempotency-Key", options.idempotencyKey);
                }
                let body = options.body;
                if (isJsonBody(body)) {
                    body = JSON.stringify(body);
                    if (!hasHeader(options.headers, "content-type")) {
                        headers.push("Content-Type", "application/json");
                    }
                }
                request.send(
                    url,
                    body ?? null,
                    method.toLowerCase() as "get" | "post" | "head",
                    options.responseType ?? "json",
                    headers,
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
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
        return "HTTP timeout must be a finite non-negative number.";
    }
    if (!Number.isInteger(retry.maxAttempts) || retry.maxAttempts < 1 || retry.maxAttempts > 5) {
        return "HTTP retry maxAttempts must be an integer from 1 to 5.";
    }
    if (!Number.isFinite(retry.baseDelayMs) || retry.baseDelayMs < 0
        || !Number.isFinite(retry.maxDelayMs) || retry.maxDelayMs < retry.baseDelayMs) {
        return "HTTP retry delays must be finite, non-negative, and maxDelayMs must cover baseDelayMs.";
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
    return Math.max(0, Math.round(exponential - spread + Math.random() * spread * 2));
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

function isJsonBody(body: unknown): body is readonly unknown[] | Readonly<Record<string, unknown>> {
    if (Array.isArray(body)) {
        return true;
    }
    if (!body || typeof body !== "object") {
        return false;
    }
    const prototype = Object.getPrototypeOf(body);
    return prototype === Object.prototype || prototype === null;
}

function flattenHeaders(headers?: Readonly<Record<string, string>>): string[] {
    const flattened: string[] = [];
    if (!headers) {
        return flattened;
    }
    for (const key of Object.keys(headers)) {
        flattened.push(key, headers[key]);
    }
    return flattened;
}

function hasHeader(headers: Readonly<Record<string, string>> | undefined, expected: string): boolean {
    if (!headers) {
        return false;
    }
    return Object.keys(headers).some((key) => key.toLowerCase() === expected);
}
