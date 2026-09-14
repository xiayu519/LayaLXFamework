/** 使用真实引擎验证延迟表格和 UI 加载，以及初始化失败后的重试。 */
export default function startupProbe() {
    return `(${verifyStartup.toString()})()`;
}

async function verifyStartup() {
    const { lx, Laya } = globalThis;
    const assert = (condition, message) => { if (!condition) throw new Error(`Startup: ${message}`); };
    const frame = () => new Promise(resolve => Laya.timer.frameOnce(1, null, resolve));
    const wait = async (predicate, message) => {
        const deadline = performance.now() + 5000;
        while (!predicate()) {
            assert(performance.now() < deadline, message);
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    };
    const scene = name => Laya.Scene.root.getChildByName(name);
    const originalLoad = Laya.loader.load;
    let releaseTables, releaseUI, tablesRequested = false, uiRequested = false, lobbyRequested = false;
    const tablesGate = new Promise(resolve => { releaseTables = resolve; });
    const uiGate = new Promise(resolve => { releaseUI = resolve; });
    await lx.stop();
    Laya.loader.load = function(url, ...args) {
        const result = originalLoad.call(this, url, ...args);
        if (url === "bootstrap/scenes/Lobby.ls") lobbyRequested = true;
        if (url === "bootstrap/tables/tbtableappconfig.bin") {
            tablesRequested = true;
            return Promise.resolve(result).then(async value => { await tablesGate; return value; });
        }
        if (url === "bootstrap/ui/examples/UILobby.lh") {
            uiRequested = true;
            return Promise.resolve(result).then(async value => { await uiGate; return value; });
        }
        return result;
    };
    let starting;
    try {
        starting = globalThis.$_main_();
        await wait(() => tablesRequested, "tables never began loading");
        const startup = scene("Startup"), view = startup?.loadingView;
        assert(startup?.displayedInStage && view?.activeInHierarchy && !lx.ready,
            "Startup was not visible while the framework initialized");
        assert(!lobbyRequested && !scene("Lobby"), "Lobby loaded before framework data was ready");
        assert(!document.getElementById("splash"), "HTML splash covers the native Startup scene");
        const heldPercent = view.percentText.text;
        await frame(); await frame();
        assert(view.percentText.text === heldPercent && parseInt(heldPercent) < 100,
            "startup progress advances without completed work");
        assert(view.phaseText.text.includes("配置表"), "startup stage does not describe the pending service");

        const platform = lx.platform;
        const { width, height } = platform.viewport;
        const layouts = [];
        for (const viewport of [platform.viewport, { width, height,
            safeArea: { x: 12, y: 30, width: width - 24, height: height - 50 },
            topRightAvoidance: { x: width - 104, y: 32, width: 88, height: 32 } }]) {
            startup.setViewportProvider({ viewport });
            const full = view.getChild("full"), safe = view.getChild("safeContent");
            const slots = Array.from({ length: safe.numChildren }, (_, index) => safe.getChildAt(index).name);
            assert(slots.join(",") === "top,full,mid,bottom", "Startup does not preserve the complete UI skeleton");
            const mid = safe.getChild("mid");
            assert(full.width === Laya.stage.width && full.height === Laya.stage.height,
                "Startup background does not cover the viewport");
            assert(mid.x >= -1 && mid.y >= -1 && mid.x + mid.width * mid.scaleX <= safe.width + 1
                && mid.y + mid.height * mid.scaleY <= safe.height + 1, "Startup progress card exceeds the safe area");
            layouts.push({ width: view.width, height: view.height, midScale: mid.scaleX });
        }
        startup.setViewportProvider(platform);
        releaseTables();
        await wait(() => uiRequested, "Lobby UI never began loading");
        assert(!startup.destroyed && view.activeInHierarchy && scene("Lobby")
            && startup.zOrder > scene("Lobby").zOrder && lx.ready,
            "Startup left before Lobby UI was ready");
        assert(lx.ui.snapshot().visible.length === 0, "initial Lobby opened a second application loading window");
        const lobbyPercent = parseInt(view.percentText.text);
        assert(lobbyPercent >= parseInt(heldPercent) && lobbyPercent < 100, "initial scene progress is not monotonic");
        assert(lx.snapshot().synchronization.state === "ready", "root is Ready without completed initial synchronization");
        let reentryFinished = false;
        const reentry = globalThis.$_main_().then(() => { reentryFinished = true; });
        await frame();
        assert(!reentryFinished, "native main reentry returned while the initial World was still loading");
        releaseUI();
        await starting;
        await reentry;
        assert(startup.destroyed && view.destroyed && !scene("Startup") && lx.ready,
            "Startup was not destroyed after application readiness");
        assert(lx.scenes.get("examples.lobby").ui.snapshot().views.some(entry => entry.visible && entry.routeId === "lx.status"),
            "completed startup did not show the Lobby UI");
        Laya.loader.load = originalLoad;

        // 模块失败时保留配置好的错误界面，回滚框架，并允许重新调用 main()。
        await lx.stop();
        Laya.loader.load = function(url, ...args) {
            if (url === "bootstrap/tables/tbtableappconfig.bin") return Promise.resolve(null);
            return originalLoad.call(this, url, ...args);
        };
        const failure = await globalThis.$_main_().then(() => undefined, error => error);
        const failed = scene("Startup");
        assert(failure instanceof Error && !lx.ready && !scene("Lobby"), "failed startup entered Lobby or claimed readiness");
        assert(failed?.loadingView.phaseText.text.includes("启动失败") && failed.displayedInStage,
            "startup failure left an empty screen");
        Laya.loader.load = originalLoad;
        await globalThis.$_main_();
        assert(failed.destroyed && lx.ready && !scene("Startup"), "retry retained a failed Startup scene");
        return { passed: true, startupBeforeServices: true, progressWaitsForWork: true, layouts,
            startupUntilLobbyUIReady: true, noDuplicateLoading: true, failureVisible: true, retryReleasesFailure: true };
    } finally {
        releaseTables(); releaseUI();
        Laya.loader.load = originalLoad;
        await starting?.catch(() => {});
    }
}
