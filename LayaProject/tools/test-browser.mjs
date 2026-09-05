import { spawn } from "node:child_process";
import {
    createReadStream,
    existsSync,
    mkdtempSync,
    readFileSync,
    promises as fs,
    statSync,
} from "node:fs";
import { createServer } from "node:http";
import { homedir, tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releaseRoot = join(projectRoot, "release", "web");
const performanceSettings = JSON.parse(readFileSync(join(projectRoot, "settings", "PerformanceBudgets.json"), "utf8"));
const headlessProfile = performanceSettings.profiles[performanceSettings.headless.profile];
const startupRenderBudget = headlessProfile.scenes[performanceSettings.headless.scene];
const temporaryRoot = resolve(tmpdir());
const profileRoot = mkdtempSync(join(temporaryRoot, "lx-browser-"));
if (!profileRoot.startsWith(`${temporaryRoot}${sep}`)) {
    throw new Error(`Browser profile escaped the temporary directory: ${profileRoot}`);
}
const browserPath = findBrowser();
let browser;
let socket;
const probePng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
);

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
    if (pathname === "/__lx_probe_slow.png") {
        setTimeout(() => {
            response.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
            response.end(probePng);
        }, 200);
        return;
    }
    if (pathname === "/__lx_probe_fast.png" || pathname === "/__lx_probe_shared.png") {
        response.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
        response.end(probePng);
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
        || !runtimeState.tablesReady
        || runtimeState.configValue !== "LXFamework"
        || runtimeState.tableValue !== "LXFamework"
        || !runtimeState.spineReady
        || runtimeState.spineVersion !== "4.2"
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
    await runEngineLifecycleProbes(cdp);
    const shutdown = await cdp.send("Runtime.evaluate", {
        expression: `(async () => {
            const services = {
                config: globalThis.LX.Config,
                tables: globalThis.LX.Tables,
                ui: globalThis.LX.UI,
                pool: globalThis.LX.Pool,
                audio: globalThis.LX.Audio,
            };
            const startup = Array.from(globalThis.Laya.Scene.unDestroyedScenes)
                .find((scene) => Boolean(scene.getComponent?.(globalThis.Laya.Script)));
            if (!startup) throw new Error("Startup scene was not found.");
            startup.destroy();
            const deadline = performance.now() + 5000;
            while (globalThis.LX.Ready && performance.now() < deadline) {
                await new Promise((resolve) => setTimeout(resolve, 20));
            }
            return {
                ready: globalThis.LX.Ready,
                configReady: services.config.ready,
                tablesReady: services.tables.ready,
                managedUI: services.ui.snapshot().managed.length,
                pools: services.pool.snapshot().length,
                sfx: services.audio.snapshot().activeSfx,
                configCached: Boolean(globalThis.Laya.loader.getRes("bootstrap/config/runtime.json")),
                tablesCached: Boolean(globalThis.Laya.loader.getRes("bootstrap/tables/game/tbtableappconfig.bin")),
            };
        })()`,
        awaitPromise: true,
        returnByValue: true,
    });
    const shutdownState = shutdown.result?.value;
    if (shutdown.exceptionDetails
        || shutdownState?.ready !== false
        || shutdownState?.configReady !== false
        || shutdownState?.tablesReady !== false
        || shutdownState?.managedUI !== 0
        || shutdownState?.pools !== 0
        || shutdownState?.sfx !== 0
        || shutdownState?.configCached !== false
        || shutdownState?.tablesCached !== false) {
        throw new Error(`runtime shutdown did not release every owner: ${JSON.stringify(shutdownState)}`);
    }
    if (consoleErrors.length > 0 || runtimeErrors.length > 0 || failedRequests.length > 0) {
        throw new Error(`browser errors: ${consoleErrors.concat(runtimeErrors, failedRequests).join(" | ")}`);
    }
    console.log(
        `Browser OK: ${runtimeState.title}, LayaAir ${runtimeState.engineVersion}, pure 2D, `
        + `config=${runtimeState.configValue}, tables=${runtimeState.tableValue}, UI/Spine ${runtimeState.spineVersion}/performance ready, `
        + `status=${runtimeState.statusText}, Timer/GLoader/shared-texture/PrefabPool/Tip/UI-modal probes passed, clean scene shutdown, no errors.`,
    );
} finally {
    socket?.close();
    if (browser && !browser.killed) {
        browser.kill();
    }
    await close(server);
    await fs.rm(profileRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
}

async function runEngineLifecycleProbes(cdp) {
    const evaluation = await cdp.send("Runtime.evaluate", {
        expression: `(async () => {
            const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

            const timerOwner = {};
            let timerCalls = 0;
            globalThis.Laya.timer.once(20, timerOwner, () => { timerCalls += 1; });
            globalThis.Laya.timer.clearAll(timerOwner);
            await delay(60);
            const timerCleared = timerCalls === 0;

            const loader = new globalThis.Laya.GLoader();
            loader.size(8, 8);
            globalThis.Laya.GRoot.inst.addChild(loader);
            loader.src = "__lx_probe_slow.png";
            loader.src = "__lx_probe_fast.png";
            await delay(350);
            const fastTexture = globalThis.Laya.Loader.getRes(
                "__lx_probe_fast.png",
                globalThis.Laya.Loader.IMAGE,
            );
            const loaderLatest = loader.src === "__lx_probe_fast.png"
                && loader.texture === fastTexture
                && !loader.texture?.destroyed;
            loader.src = "";
            const loaderCleared = loader.texture == null;
            loader.destroy();

            const texture = await globalThis.Laya.loader.load(
                "__lx_probe_shared.png",
                globalThis.Laya.Loader.IMAGE,
            );
            const firstSprite = new globalThis.Laya.Sprite();
            const secondSprite = new globalThis.Laya.Sprite();
            firstSprite.graphics.drawTexture(texture, 0, 0, 1, 1);
            secondSprite.graphics.drawTexture(texture, 0, 0, 1, 1);
            globalThis.Laya.stage.addChild(firstSprite);
            globalThis.Laya.stage.addChild(secondSprite);
            const sharedReferenceCount = texture.referenceCount;
            firstSprite.destroy();
            globalThis.Laya.Scene.gc();
            await delay(80);
            const sharedSurvivedFirstOwner = !texture.destroyed && texture.referenceCount > 0;
            secondSprite.destroy();
            await delay(80);
            globalThis.Laya.Scene.gc();
            await delay(150);

            const poolId = "__lx_headless_prefab";
            globalThis.LX.Pool.register({
                id: poolId,
                url: "bootstrap/ui/FrameworkStatus.lh",
                maxIdle: 1,
                maxActive: 1,
            });
            const firstNode = await globalThis.LX.Pool.acquire(poolId);
            globalThis.LX.Pool.release(poolId, firstNode);
            const secondNode = await globalThis.LX.Pool.acquire(poolId);
            const poolReused = firstNode === secondNode;
            globalThis.LX.Pool.release(poolId, secondNode);
            globalThis.LX.Pool.drain(poolId);
            const poolDrained = globalThis.LX.Pool.snapshot()
                .find((entry) => entry.id === poolId)?.idle === 0;

            globalThis.LX.UI.tip("Headless tip one");
            globalThis.LX.UI.tip("Headless tip two");
            await delay(80);
            const firstTip = globalThis.LX.UI.snapshot().tips;
            const tipRoot = globalThis.Laya.GRoot.inst;
            const firstTipView = Array.from({ length: tipRoot.numChildren }, (_, index) => tipRoot.getChildAt(index))
                .find((node) => node.name === "LXTip");
            const firstTipQueued = firstTip.active === 1
                && firstTip.queued === 1
                && firstTipView?.getChildByName?.("messageText")?.text === "Headless tip one";
            await delay(520);
            const secondTip = globalThis.LX.UI.snapshot().tips;
            const tipCadence = secondTip.shown >= 2 && secondTip.active === 2 && secondTip.queued === 0;
            await delay(1320);
            const idleTips = globalThis.LX.Pool.snapshot().find((entry) => entry.id === "lx.ui.tip")?.idle ?? 0;
            const tipsReleased = globalThis.LX.UI.snapshot().tips.active === 0 && idleTips >= 2;
            globalThis.LX.UI.tip("Headless tip three");
            await delay(80);
            const reusedTipPool = globalThis.LX.Pool.snapshot()
                .find((entry) => entry.id === "lx.ui.tip");
            const tipReused = reusedTipPool?.active === 1 && reusedTipPool.idle >= 1;
            await delay(1320);

            const statusInfo = globalThis.LX.UI.snapshot().managed
                .find((entry) => entry.routeId === "lx.status");
            if (!statusInfo) throw new Error("Status window was not available for the UI probe.");
            const ProbeWindow = class extends statusInfo.window.constructor {};
            const routeId = "__lx_headless_modal";
            globalThis.LX.UI.register({
                id: routeId,
                url: "bootstrap/ui/FrameworkStatus.lh",
                layer: 3,
                modal: true,
                multiplicity: "multiple",
                retention: "destroy",
                create: (pane) => new ProbeWindow(pane),
            });
            const popup = await globalThis.LX.UI.show(routeId, {
                status: "PROBE",
                detail: "Headless lifecycle probe",
            });
            await delay(40);
            const root = globalThis.Laya.GRoot.inst;
            const modalLayer = root.modalLayer;
            const popupIndex = root.getChildIndex(popup);
            const modalIndex = root.getChildIndex(modalLayer);
            const statusIndex = root.getChildIndex(statusInfo.window);
            const modalOrdered = popupIndex > modalIndex
                && modalIndex > statusIndex
                && modalLayer.zOrder === popup.zOrder
                && globalThis.LX.UI.getTop()?.window === popup;
            globalThis.LX.UI.close(routeId, popup);
            await delay(40);
            const uiDestroyed = popup.destroyed
                && !globalThis.LX.UI.snapshot().managed.some((entry) => entry.routeId === routeId);

            await delay(80);
            globalThis.Laya.Scene.gc();
            await delay(200);
            const sharedReleasedAfterLastOwner = texture.referenceCount === 0
                && texture.bitmap?.destroyed === true;

            return {
                timerCleared,
                loaderLatest,
                loaderCleared,
                sharedReferenceCount,
                sharedSurvivedFirstOwner,
                sharedReleasedAfterLastOwner,
                poolReused,
                poolDrained,
                firstTipQueued,
                tipCadence,
                tipsReleased,
                tipReused,
                modalOrdered,
                uiDestroyed,
            };
        })()`,
        awaitPromise: true,
        returnByValue: true,
    });
    const result = evaluation.result?.value;
    if (evaluation.exceptionDetails
        || result?.timerCleared !== true
        || result?.loaderLatest !== true
        || result?.loaderCleared !== true
        || result?.sharedReferenceCount < 2
        || result?.sharedSurvivedFirstOwner !== true
        || result?.sharedReleasedAfterLastOwner !== true
        || result?.poolReused !== true
        || result?.poolDrained !== true
        || result?.firstTipQueued !== true
        || result?.tipCadence !== true
        || result?.tipsReleased !== true
        || result?.tipReused !== true
        || result?.modalOrdered !== true
        || result?.uiDestroyed !== true) {
        throw new Error(`engine lifecycle probes failed: ${JSON.stringify(result)}`);
    }
    return result;
}

function findBrowser() {
    const candidates = [
        process.env.BROWSER_PATH,
        process.env.EDGE_PATH,
        ...(process.platform === "win32" ? [
            "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
            "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        ] : []),
        ...(process.platform === "darwin" ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
            join(homedir(), "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome"),
        ] : []),
        ...(process.platform === "linux" ? [
            "/usr/bin/microsoft-edge",
            "/usr/bin/google-chrome",
            "/usr/bin/chromium",
        ] : []),
    ].filter(Boolean);
    const path = candidates.find((candidate) => existsSync(candidate));
    if (!path) {
        throw new Error("Edge/Chrome/Chromium was not found. Set BROWSER_PATH to a Chromium browser executable.");
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
                const tablesReady = ready && globalThis.LX.Tables.ready === true;
                const configValue = configReady
                    ? globalThis.LX.Config.require("lx.runtime-config")?.framework ?? null
                    : null;
                const tableValue = tablesReady
                    ? globalThis.LX.Tables.require().TbTableAppConfig.get(1)?.value ?? null
                    : null;
                let render = null;
                let ownershipReady = false;
                if (ready) {
                    render = globalThis.LX.Performance.assertBudget(${JSON.stringify(startupRenderBudget)});
                    const ui = globalThis.LX.UI.snapshot();
                    ownershipReady = ui.loading["lx.status"] === undefined
                        && ui.managed.length === 1
                        && ui.visible.length === 1
                        && ui.top?.routeId === "lx.status"
                        && ui.bottom?.routeId === "lx.status"
                        && globalThis.LX.Res === globalThis.Laya.loader
                        && globalThis.LX.Scene === globalThis.Laya.Scene;
                }
                return {
                    ready,
                    uiReady: ready && Boolean(globalThis.LX.UI),
                    configReady,
                    configValue,
                    tablesReady,
                    tableValue,
                    spineReady: ready && typeof globalThis.Laya.Spine2DRenderNode === "function",
                    spineVersion: globalThis.Laya?.PlayerConfig?.spineVersion ?? null,
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
        if (state?.ready && state?.uiReady && state?.configReady && state?.tablesReady && state?.statusText === "READY") {
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
