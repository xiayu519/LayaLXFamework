export interface PreparedHttpPayload {
    readonly body: string | ArrayBuffer | null;
    readonly headers: string[];
}

/** Snapshot once so retries cannot silently send different JSON or binary data. */
export function prepareHttpPayload(
    body: unknown,
    headers: Readonly<Record<string, string>> | undefined,
    idempotencyKey: string | undefined,
): PreparedHttpPayload {
    const normalized = new Map<string, { name: string; value: string }>();
    for (const [name, value] of Object.entries(headers ?? {})) {
        if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || /[\r\n]/.test(value)) {
            throw new Error("HTTP headers must use valid names and single-line values.");
        }
        const lower = name.toLowerCase();
        if (normalized.has(lower)) {
            throw new Error("HTTP headers must not repeat a case-insensitive name.");
        }
        normalized.set(lower, { name: lower === "content-type" ? "Content-Type" : name, value });
    }
    if (idempotencyKey) {
        if (/[\r\n]/.test(idempotencyKey)) {
            throw new Error("HTTP idempotencyKey must be a single-line value.");
        }
        const existing = normalized.get("idempotency-key");
        if (existing && existing.value !== idempotencyKey) {
            throw new Error("HTTP Idempotency-Key header must match idempotencyKey.");
        }
        normalized.set("idempotency-key", { name: "Idempotency-Key", value: idempotencyKey });
    }

    let encoded: PreparedHttpPayload["body"];
    let contentType: string | undefined;
    if (body === null || body === undefined) {
        encoded = null;
    } else if (typeof body === "string") {
        encoded = body;
    } else if (body instanceof ArrayBuffer) {
        encoded = body.slice(0);
        contentType = "application/octet-stream";
    } else if (ArrayBuffer.isView(body)) {
        encoded = new Uint8Array(new Uint8Array(body.buffer, body.byteOffset, body.byteLength)).buffer;
        contentType = "application/octet-stream";
    } else if (Array.isArray(body) || isPlainObject(body)) {
        encoded = JSON.stringify(body);
        if (encoded === undefined) {
            throw new Error("HTTP JSON body did not produce a JSON value.");
        }
        contentType = "application/json";
    } else {
        throw new Error("HTTP body must be a string, JSON object/array, ArrayBuffer, or ArrayBufferView.");
    }
    if (contentType && !normalized.has("content-type")) {
        normalized.set("content-type", { name: "Content-Type", value: contentType });
    }
    return { body: encoded, headers: [...normalized.values()].flatMap(({ name, value }) => [name, value]) };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== "object") return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
