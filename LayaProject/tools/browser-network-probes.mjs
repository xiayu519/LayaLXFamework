/** Deterministic local endpoints: no external service or game backend required. */
export function handleNetworkProbe(request, response, pathname) {
    if (!pathname.startsWith("/__lx_http/")) return false;
    const send = (status, data) => {
        response.writeHead(status, { "Content-Type": "application/json", "X-LX-Probe": "engine", "Cache-Control": "no-store" });
        response.end(data === undefined ? undefined : JSON.stringify(data));
    };
    const action = pathname.slice("/__lx_http/".length);
    if (action === "delay") setTimeout(() => send(200, { ok: true }), 250);
    else if (action === "invalid") response.writeHead(200, { "Content-Type": "application/json" }).end("not-json");
    else if (action === "echo") {
        const chunks = [];
        request.on("data", (chunk) => chunks.push(chunk));
        request.on("end", () => send(201, {
            bytes: [...Buffer.concat(chunks)], contentType: request.headers["content-type"],
        }));
    } else {
        const status = Number(action);
        if ([200, 201, 202, 204, 205].includes(status)) send(status, status < 204 ? { ok: true } : undefined);
        else response.writeHead(404).end();
    }
    return true;
}

/** Self-contained browser function, executed against LX.Net and the real Laya engine. */
export async function runNetworkProbes() {
    const net = globalThis.LX.Net;
    const assert = (condition, label) => { if (!condition) throw new Error(`Network probe: ${label}`); };
    for (const status of [201, 202, 204, 205]) {
        const result = await net.request(`__lx_http/${status}`);
        assert(result.status === status && (status < 204 ? result.data.ok : result.data === null), `status ${status}`);
        assert(result.headers["x-lx-probe"] === "engine", "response headers");
    }
    const head = await net.request("__lx_http/200", { method: "HEAD" });
    assert(head.data === null, "HEAD empty JSON");
    const expectError = async (operation, kind) => {
        let error;
        try { await operation; } catch (caught) { error = caught; }
        assert(error?.kind === kind && error.attempt === 1, `${kind} classification`);
    };
    await expectError(net.request("__lx_http/invalid", { retry: { maxAttempts: 3 } }), "parse");
    await expectError(net.request("__lx_http/200", { validate: () => false, retry: { maxAttempts: 3 } }), "schema");
    const json = await net.request("__lx_http/echo", {
        method: "POST", body: { value: "世界" }, headers: { "content-type": "application/json" },
    });
    assert(json.data.contentType === "application/json"
        && new TextDecoder().decode(new Uint8Array(json.data.bytes)) === JSON.stringify({ value: "世界" }), "JSON payload/header");
    const bytes = new Uint8Array([9, 1, 2, 9]);
    const binary = await net.request("__lx_http/echo", { method: "POST", body: bytes.subarray(1, 3) });
    assert(JSON.stringify(binary.data.bytes) === "[1,2]" && binary.data.contentType === "application/octet-stream", "binary byteOffset");
    await expectError(net.request("__lx_http/delay", { timeoutMs: 20 }), "timeout");
    const controller = new AbortController();
    const operation = net.request("__lx_http/delay", { signal: controller.signal });
    controller.abort();
    await expectError(operation, "abort");
    const render = globalThis.LX.Performance.capture();
    assert(render.statisticsReady && render.gpuBytes > 0 && render.drawCalls2D > 0, "nonzero engine statistics");
    let rejected = false;
    try { globalThis.LX.Performance.assertBudget({ gpuBytes: 0 }, render); } catch { rejected = true; }
    assert(rejected, "GPU budget really rejects");
    return { http2xx: true, emptyJson: true, headers: true, payloads: true, cancellation: true, render };
}
