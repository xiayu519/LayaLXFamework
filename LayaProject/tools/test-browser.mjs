import { spawn } from "node:child_process";
import {
    createReadStream,
    existsSync,
    mkdtempSync,
    promises as fs,
    statSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releaseRoot = join(projectRoot, "release", "web");
const temporaryRoot = resolve(tmpdir());
const profileRoot = mkdtempSync(join(temporaryRoot, "lx-browser-"));
if (!profileRoot.startsWith(`${temporaryRoot}${sep}`)) {
    throw new Error(`Browser profile escaped the temporary directory: ${profileRoot}`);
}
const browserPath = findBrowser();
let browser;
let socket;

const server = createServer((request, response) => {
    let pathname;
    try {
        pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
    } catch {
        response.writeHead(400).end("Bad request");
        return;
    }
    if (pathname === "/favicon.ico") {
        response.writeHead(204).end();
        return;
    }
    const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
    const filePath = resolve(releaseRoot, relativePath);
    if (filePath !== releaseRoot && !filePath.startsWith(`${releaseRoot}${sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
    }
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        response.writeHead(404).end("Not found");
        return;
    }
    response.writeHead(200, { "Content-Type": contentType(filePath) });
    createReadStream(filePath).pipe(response);
});

try {
    if (!existsSync(join(releaseRoot, "index.html"))) {
        throw new Error("release/web is missing; run npm run build:web first.");
    }
    const address = await listen(server);
    const targetUrl = `http://127.0.0.1:${address.port}/`;
    browser = spawn(browserPath, [
        "--headless=new",
        "--disable-extensions",
        "--no-first-run",
        "--no-default-browser-check",
        "--enable-webgl",
        "--ignore-gpu-blocklist",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--remote-debugging-port=0",
        `--user-data-dir=${profileRoot}`,
        "about:blank",
    ], {
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true,
    });

    const browserWebSocketUrl = await waitForDebugger(browser);
    const debuggerOrigin = new URL(browserWebSocketUrl).origin.replace("ws:", "http:").replace("wss:", "https:");
    const pageTarget = await waitForPageTarget(debuggerOrigin);
    socket = await connect(pageTarget.webSocketDebuggerUrl);
    const cdp = createCdpClient(socket);
    const consoleLines = [];
    const consoleErrors = [];
    const runtimeErrors = [];
    const failedRequests = [];
    const pendingRequests = new Set();

    cdp.on("Runtime.consoleAPICalled", (event) => {
        const line = event.params.args
            .map((item) => item.value ?? item.description ?? "")
            .join(" ");
        consoleLines.push(`${event.params.type}: ${line}`);
        if (event.params.type === "error") {
            consoleErrors.push(line);
        }
    });
    cdp.on("Runtime.exceptionThrown", (event) => {
        runtimeErrors.push(event.params.exceptionDetails.text);
    });
    cdp.on("Network.responseReceived", (event) => {
        if (event.params.response.status >= 400) {
            failedRequests.push(`${event.params.response.status} ${event.params.response.url}`);
        }
    });
    cdp.on("Network.requestWillBeSent", (event) => {
        pendingRequests.add(event.params.requestId);
    });
    cdp.on("Network.loadingFinished", (event) => {
        pendingRequests.delete(event.params.requestId);
    });
    cdp.on("Network.loadingFailed", (event) => {
        pendingRequests.delete(event.params.requestId);
        if (!event.params.canceled) {
            failedRequests.push(`${event.params.errorText} ${event.params.requestId}`);
        }
    });

    await cdp.send("Runtime.enable");
    await cdp.send("Network.enable");
    await cdp.send("Page.enable");
    await cdp.send("Page.navigate", { url: targetUrl });

    let runtimeState;
    try {
        runtimeState = await waitForRuntime(cdp, 20_000);
    } catch (error) {
        const evidence = consoleLines.concat(consoleErrors, runtimeErrors, failedRequests).join(" | ");
        throw new Error(`${error instanceof Error ? error.message : String(error)}; browser evidence: ${evidence || "none"}`);
    }
    await waitForNetworkIdle(pendingRequests, 5_000);
    if (
        !runtimeState.ready
        || !runtimeState.uiReady
        || !runtimeState.configReady
        || runtimeState.configValue !== "LXFamework"
        || !runtimeState.spineReady
        || !runtimeState.performanceReady
        || !runtimeState.ownershipReady
        || runtimeState.statusText !== "READY"
        || runtimeState.engineVersion !== "3.4.1"
        || runtimeState.has3D
    ) {
        throw new Error(`unexpected runtime state: ${JSON.stringify(runtimeState)}`);
    }
    if (!consoleLines.some((line) => line.includes("[LX] READY"))) {
        throw new Error(`missing '[LX] READY' console marker (${consoleLines.join(" | ")})`);
    }
    if (consoleErrors.length > 0 || runtimeErrors.length > 0 || failedRequests.length > 0) {
        throw new Error(`browser errors: ${consoleErrors.concat(runtimeErrors, failedRequests).join(" | ")}`);
    }
    const shutdown = await cdp.send("Runtime.evaluate", {
        expression: `(async () => {
            const runtime = globalThis.LX.App;
            await runtime.stop();
            const resources = runtime.resources.snapshot();
            const ui = runtime.ui.snapshot();
            return {
                ready: globalThis.LX.Ready,
                configReady: runtime.config.ready,
                managedUI: ui.managed.length,
                activeLeases: Object.keys(resources.activeLeases).length,
                trackedGroups: Object.keys(resources.trackedGroups).length,
                pools: runtime.pool.snapshot().length,
                spines: runtime.spine.snapshot().active,
                sfx: runtime.audio.snapshot().activeSfx,
            };
        })()`,
        awaitPromise: true,
        returnByValue: true,
    });
    const shutdownState = shutdown.result?.value;
    if (shutdown.exceptionDetails
        || shutdownState?.ready !== false
        || shutdownState?.configReady !== false
        || shutdownState?.managedUI !== 0
        || shutdownState?.activeLeases !== 0
        || shutdownState?.trackedGroups !== 0
        || shutdownState?.pools !== 0
        || shutdownState?.spines !== 0
        || shutdownState?.sfx !== 0) {
        throw new Error(`runtime shutdown did not release every owner: ${JSON.stringify(shutdownState)}`);
    }
    console.log(`Browser OK: ${runtimeState.title}, LayaAir ${runtimeState.engineVersion}, pure 2D, config=${runtimeState.configValue}, UI/Spine/performance ready, status=${runtimeState.statusText}, clean shutdown, no errors.`);
} finally {
    socket?.close();
    if (browser && !browser.killed) {
        browser.kill();
    }
    await close(server);
    await fs.rm(profileRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
}

function findBrowser() {
    const candidates = [
        process.env.EDGE_PATH,
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "/usr/bin/microsoft-edge",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
    ].filter(Boolean);
    const path = candidates.find((candidate) => existsSync(candidate));
    if (!path) {
        throw new Error("Edge/Chrome/Chromium was not found. Set EDGE_PATH to a Chromium browser executable.");
    }
    return path;
}

function contentType(path) {
    return ({
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".ls": "application/json; charset=utf-8",
        ".lh": "application/json; charset=utf-8",
        ".png": "image/png",
        ".atlas": "application/json; charset=utf-8",
    })[extname(path).toLowerCase()] ?? "application/octet-stream";
}

function listen(httpServer) {
    return new Promise((resolvePromise, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(0, "127.0.0.1", () => resolvePromise(httpServer.address()));
    });
}

function close(httpServer) {
    if (!httpServer.listening) {
        return Promise.resolve();
    }
    return new Promise((resolvePromise) => httpServer.close(resolvePromise));
}

function waitForDebugger(processHandle) {
    return new Promise((resolvePromise, reject) => {
        let stderr = "";
        const timeout = setTimeout(() => reject(new Error(`browser debugger timeout: ${stderr}`)), 10_000);
        processHandle.once("error", reject);
        processHandle.once("exit", (code) => reject(new Error(`browser exited before debugger was ready (${code}): ${stderr}`)));
        processHandle.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
            const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
            if (match) {
                clearTimeout(timeout);
                resolvePromise(match[1]);
            }
        });
    });
}

async function waitForPageTarget(origin) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
        const targets = await fetch(`${origin}/json/list`).then((response) => response.json());
        const page = targets.find((target) => target.type === "page");
        if (page?.webSocketDebuggerUrl) {
            return page;
        }
        await delay(50);
    }
    throw new Error("browser page target was not created.");
}

function connect(url) {
    return new Promise((resolvePromise, reject) => {
        const webSocket = new WebSocket(url);
        webSocket.addEventListener("open", () => resolvePromise(webSocket), { once: true });
        webSocket.addEventListener("error", () => reject(new Error("could not connect to browser debugger.")), { once: true });
    });
}

function createCdpClient(webSocket) {
    let sequence = 0;
    const pending = new Map();
    const listeners = new Map();
    webSocket.addEventListener("message", (message) => {
        const payload = JSON.parse(message.data);
        if (payload.id) {
            const request = pending.get(payload.id);
            if (!request) {
                return;
            }
            pending.delete(payload.id);
            if (payload.error) {
                request.reject(new Error(payload.error.message));
            } else {
                request.resolve(payload.result);
            }
            return;
        }
        for (const listener of listeners.get(payload.method) ?? []) {
            listener(payload);
        }
    });
    return {
        send(method, params = {}) {
            const id = ++sequence;
            return new Promise((resolvePromise, reject) => {
                pending.set(id, { resolve: resolvePromise, reject });
                webSocket.send(JSON.stringify({ id, method, params }));
            });
        },
        on(method, listener) {
            const methodListeners = listeners.get(method) ?? [];
            methodListeners.push(listener);
            listeners.set(method, methodListeners);
        },
    };
}

async function waitForRuntime(cdp, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let lastState;
    while (Date.now() < deadline) {
        const evaluation = await cdp.send("Runtime.evaluate", {
            expression: `(() => {
                const findStatusText = (node, depth = 0) => {
                    if (!node || depth > 8) return null;
                    if (node.name === "statusText") return node.text ?? null;
                    if (node.contentPane && node.contentPane !== node) {
                        const result = findStatusText(node.contentPane, depth + 1);
                        if (result !== null) return result;
                    }
                    const count = node.numChildren ?? 0;
                    for (let index = 0; index < count; index += 1) {
                        const result = findStatusText(node.getChildAt?.(index), depth + 1);
                        if (result !== null) return result;
                    }
                    return null;
                };
                const status = globalThis.Laya?.stage
                    ?.getChildAt(0)
                    ?.getComponent?.(globalThis.Laya?.Script);
                const statusText = findStatusText(globalThis.Laya?.GRoot?.inst);
                const ready = globalThis.LX?.Ready === true;
                const configReady = ready && globalThis.LX.Config.ready === true;
                const configValue = configReady
                    ? globalThis.LX.Config.require().TbTableAppConfig.get(1)?.value ?? null
                    : null;
                let render = null;
                let ownershipReady = false;
                if (ready) {
                    render = globalThis.LX.Performance.assertBudget({
                        drawCalls2D: 20,
                        drawCalls: 20,
                        triangles: 1000,
                    });
                    const ui = globalThis.LX.UI.snapshot();
                    const resources = globalThis.LX.Res.snapshot();
                    ownershipReady = ui.loading["lx.status"] === undefined
                        && ui.managed.length === 1
                        && ui.visible.length === 1
                        && ui.top?.routeId === "lx.status"
                        && ui.bottom?.routeId === "lx.status"
                        && resources.activeLeases["ui:bootstrap"] === 1
                        && resources.activeLeases["config:game"] === undefined
                        && resources.trackedGroups["config:game"] === undefined;
                }
                return {
                    ready,
                    uiReady: ready && Boolean(globalThis.LX.UI),
                    configReady,
                    configValue,
                    spineReady: ready && Boolean(globalThis.LX.Spine),
                    performanceReady: render !== null
                        && Number.isFinite(render.drawCalls2D)
                        && Number.isFinite(render.drawCalls)
                        && Number.isFinite(render.triangles),
                    ownershipReady,
                    render,
                    statusText: statusText ?? null,
                    title: document.title,
                    engineVersion: globalThis.Laya?.LayaEnv?.version ?? null,
                    has3D: typeof globalThis.Laya?.Scene3D === "function",
                    stageChildren: globalThis.Laya?.stage?.numChildren ?? -1,
                    scriptReady: Boolean(status),
                };
            })()`,
            returnByValue: true,
        });
        const state = evaluation.result?.value;
        lastState = state;
        if (state?.ready && state?.uiReady && state?.configReady && state?.statusText === "READY") {
            return state;
        }
        await delay(100);
    }
    throw new Error(`LXFamework did not reach READY in the browser before timeout: ${JSON.stringify(lastState)}`);
}

function delay(milliseconds) {
    return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function waitForNetworkIdle(pendingRequests, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let idleSince;
    while (Date.now() < deadline) {
        if (pendingRequests.size === 0) {
            idleSince ??= Date.now();
            if (Date.now() - idleSince >= 250) {
                return;
            }
        } else {
            idleSince = undefined;
        }
        await delay(50);
    }
    throw new Error(`browser network did not become idle (${pendingRequests.size} request(s) still pending).`);
}
