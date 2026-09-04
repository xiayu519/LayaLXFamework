export type HttpMethod = "GET" | "POST" | "HEAD";
export type HttpResponseType = "text" | "json" | "arraybuffer";

export interface HttpRequestOptions {
    readonly method?: HttpMethod;
    readonly headers?: Readonly<Record<string, string>>;
    readonly body?: unknown;
    readonly responseType?: HttpResponseType;
    readonly timeoutMs?: number;
    readonly signal?: AbortSignal;
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
        readonly cause?: unknown,
    ) {
        super(message);
        this.name = "HttpTransportError";
    }
}

export class LayaHttpTransport implements HttpTransport {
    request<T>(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
        if (!url) {
            return Promise.reject(new HttpTransportError("HTTP request url is required.", url, 0));
        }
        const timeoutMs = options.timeoutMs ?? 15_000;
        if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
            return Promise.reject(new HttpTransportError("HTTP timeout must be a finite non-negative number.", url, 0));
        }

        return new Promise<HttpResponse<T>>((resolve, reject) => {
            let request: Laya.HttpRequest;
            try {
                request = new Laya.HttpRequest();
            } catch (cause) {
                reject(new HttpTransportError("HTTP request initialization failed.", url, 0, cause));
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
            const fail = (message: string, cause?: unknown, abortRequest = false): void => {
                if (settled) {
                    return;
                }
                settled = true;
                const status = Number(request.http?.status ?? 0);
                cleanup();
                let finalCause = cause;
                if (abortRequest) {
                    try {
                        request.http?.abort?.();
                    } catch (abortError) {
                        finalCause ??= abortError;
                    }
                }
                reject(new HttpTransportError(message, url, status, finalCause));
            };
            const onAbort = (): void => {
                fail("HTTP request aborted.", undefined, true);
            };
            const onComplete = (): void => {
                if (settled) {
                    return;
                }
                settled = true;
                const status = Number(request.http?.status ?? 200);
                const data = request.data as T;
                cleanup();
                if (status >= 400) {
                    reject(new HttpTransportError(`HTTP request failed with status ${status}.`, url, status));
                    return;
                }
                resolve({ url, status, data });
            };

            if (options.signal?.aborted) {
                fail("HTTP request aborted before dispatch.");
                return;
            }

            try {
                request.once(Laya.Event.COMPLETE, this, onComplete);
                request.once(Laya.Event.ERROR, this, (error: unknown) => fail("HTTP request failed.", error));
                options.signal?.addEventListener("abort", onAbort, { once: true });
                if (timeoutMs > 0) {
                    timeoutId = setTimeout(() => {
                        fail(`HTTP request timed out after ${timeoutMs}ms.`, undefined, true);
                    }, timeoutMs);
                }

                const headers = flattenHeaders(options.headers);
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
                    (options.method ?? "GET").toLowerCase() as "get" | "post" | "head",
                    options.responseType ?? "json",
                    headers,
                );
            } catch (cause) {
                fail("HTTP request dispatch failed.", cause);
            }
        });
    }
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
