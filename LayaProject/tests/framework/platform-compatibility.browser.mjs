import uiWorldsProbe from "../game/logic/ui-worlds.browser.mjs";

/** 在实际发布代码中移除宿主取消 API，验证兼容路径和原生 owner 清理。 */
export default function platformCompatibilityProbe() {
    return `(async () => {
        const assert = (value, message) => { if (!value) throw new Error("Platform compatibility: " + message); };
        const native = { AbortController, AbortSignal, DOMException };
        const originalThrow = native.AbortSignal.prototype.throwIfAborted;
        const modes = [];
        const checked = async (operation, phase, timeoutMs = 8000) => {
            let timer;
            try {
                return await Promise.race([operation, new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error("Compatibility phase timeout: " + phase)), timeoutMs);
                })]);
            } finally { clearTimeout(timer); }
        };
        try {
            await checked(lx.stop(), "native stop");
            globalThis.AbortController = undefined;
            globalThis.AbortSignal = undefined;
            globalThis.DOMException = undefined;
            await checked(globalThis.$_main_(), "fallback startup");
            assert(lx.ready, "missing host APIs prevented startup");
            assert(globalThis.AbortController === undefined, "compatibility changed the host constructor");
            const worlds = await checked(${uiWorldsProbe()}, "fallback World cycles", 18000);
            modes.push({ name: "missing", worlds });
            await checked(lx.stop(), "fallback stop");
            assert(lx.snapshot().worlds.worlds.length === 0, "fallback left World owners alive");

            globalThis.AbortSignal = native.AbortSignal;
            globalThis.DOMException = native.DOMException;
            globalThis.AbortController = class extends native.AbortController {
                constructor() {
                    super();
                    Object.defineProperty(this.signal, "throwIfAborted", { configurable: true, value: undefined });
                }
            };
            await checked(globalThis.$_main_(), "legacy startup");
            const world = lx.worlds.get("examples.lobby");
            assert(lx.ready && typeof world.signal.throwIfAborted === "function", "legacy signal was not completed");
            await checked(lx.worlds.exit("examples.lobby"), "legacy World exit");
            let aborted = false;
            try { world.signal.throwIfAborted(); } catch { aborted = true; }
            assert(aborted && !lx.scenes.get("examples.lobby"), "legacy cancellation retained the scene");
            await checked(lx.worlds.enter("examples.lobby"), "legacy World reentry");
            modes.push({ name: "legacy", enteredAgain: true, aborted: true });
            await checked(lx.stop(), "legacy stop");
        } finally {
            Object.assign(globalThis, native);
        }
        assert(native.AbortSignal.prototype.throwIfAborted === originalThrow, "native prototype was modified");
        await checked(globalThis.$_main_(), "native restart");
        const platform = lx.platform;
        const viewport = platform.viewport;
        assert(viewport.safeArea?.width === viewport.width && viewport.safeArea?.height === viewport.height,
            "browser zero insets were mistaken for unknown geometry");
        const probe = [...document.body.children].find(node => node.style?.paddingTop.includes("safe-area-inset-top"));
        assert(probe, "CSS safe area probe was not created");
        try {
            probe.style.paddingTop = "12px";
            probe.style.paddingBottom = "8px";
            probe.style.paddingLeft = "7px";
            probe.style.paddingRight = "9px";
            const area = platform.viewport.safeArea;
            assert(area.x === 7 && area.y === 12 && area.width === viewport.width - 16
                && area.height === viewport.height - 20, "native CSS safe area measurement changed");
        } finally {
            platform.stop();
            assert(!probe.isConnected && platform.viewport.safeArea === undefined, "stopped CSS probe retained trusted geometry");
            platform.start();
        }
        return { passed: true, modes, nativePrototypeUnchanged: true, nativeCssGeometry: true };
    })()`;
}
