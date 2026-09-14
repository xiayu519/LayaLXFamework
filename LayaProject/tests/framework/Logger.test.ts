import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../src/framework/application/diagnostics/Logger";

afterEach(() => { logger.enabled = true; logger.style = "plain"; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("application logging", () => {
    it("uses the same logger before initialization and preserves error objects", () => {
        const output = vi.spyOn(console, "log").mockImplementation(() => {});
        const errors = vi.spyOn(console, "error").mockImplementation(() => {});
        const failure = new Error("load failed");
        logger.log("[Game] starting", { world: "lobby" });
        logger.error("[UI] failed", failure);
        expect(output).toHaveBeenCalledWith("[Game] starting", { world: "lobby" });
        expect(errors).toHaveBeenCalledWith("[UI] failed", failure);
    });

    it("disables both levels without buffering, and can enable them again", () => {
        const output = vi.spyOn(console, "log").mockImplementation(() => {});
        const errors = vi.spyOn(console, "error").mockImplementation(() => {});
        logger.enabled = false;
        logger.log("hidden"); logger.error(new Error("hidden"));
        expect(output).not.toHaveBeenCalled();
        expect(errors).not.toHaveBeenCalled();
        logger.enabled = true;
        const { log, error } = logger;
        log("visible"); error("visible error");
        expect(output).toHaveBeenCalledExactlyOnceWith("visible");
        expect(errors).toHaveBeenCalledExactlyOnceWith("visible error");
    });

    it("colors editor text without promoting logs to warnings or flattening objects", () => {
        const output = vi.spyOn(console, "log").mockImplementation(() => {});
        const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
        const errors = vi.spyOn(console, "error").mockImplementation(() => {});
        const object = { item: 7 }, failure = new Error("load failed");
        logger.style = "laya-editor";
        logger.log("[Game] %d", 7, object, failure, "[color=red]literal[/color]");
        expect(output).toHaveBeenCalledExactlyOnceWith(
            "[color=#ffd54f]\\[Game] %d[/color]", 7, object, failure,
            "[color=#ffd54f]\\[color=red]literal\\[/color][/color]");
        expect(warning).not.toHaveBeenCalled();
        logger.error("[Game] error", failure);
        expect(errors).toHaveBeenCalledExactlyOnceWith("[Game] error", failure);
        logger.enabled = false;
        logger.log("disabled"); logger.error("disabled");
        expect(output).toHaveBeenCalledTimes(1);
        expect(errors).toHaveBeenCalledTimes(1);
        logger.enabled = true;
        logger.style = "plain";
        logger.log("[Game] no markup", object);
        expect(output).toHaveBeenLastCalledWith("[Game] no markup", object);
    });

    it("uses native CSS formatting while retaining substitutions, objects and error level", () => {
        const output = vi.spyOn(console, "log").mockImplementation(() => {});
        const errors = vi.spyOn(console, "error").mockImplementation(() => {});
        const object = { count: 7 }, failure = new Error("load failed");
        logger.style = "css";
        logger.log("[Game] %s %d %o", "items", 7, object, failure);
        expect(output).toHaveBeenLastCalledWith("%c[Game] %s %d %o", "color:#ffd54f", "items", 7, object, failure);
        logger.log("literal %c", "color:red");
        expect(output).toHaveBeenLastCalledWith("%cliteral %c", "color:#ffd54f", "color:red");
        logger.log(object, failure);
        expect(output).toHaveBeenLastCalledWith(object, failure);
        logger.log();
        expect(output).toHaveBeenLastCalledWith();
        logger.error("[Game] error", failure);
        expect(errors).toHaveBeenCalledExactlyOnceWith("[Game] error", failure);
    });

    it("does not access formatting configuration or arguments when output is disabled", () => {
        const output = vi.spyOn(console, "log").mockImplementation(() => {});
        const descriptor = Object.getOwnPropertyDescriptor(logger, "style")!;
        const readStyle = vi.fn(() => { throw new Error("style accessed"); });
        const object = { toString() { throw new Error("argument converted"); } };
        Object.defineProperty(logger, "style", { configurable: true, get: readStyle });
        try {
            logger.enabled = false;
            logger.log("[Game]", object);
            expect(readStyle).not.toHaveBeenCalled();
            expect(output).not.toHaveBeenCalled();
        } finally { Object.defineProperty(logger, "style", descriptor); }
    });

    it("imports without engine or browser globals and leaves an SDK's global logger untouched", async () => {
        const sdkLogger = { log: vi.fn(), error: vi.fn(), enabled: true };
        vi.stubGlobal("logger", sdkLogger);
        vi.stubGlobal("GameGlobal", { logger: sdkLogger });
        vi.stubGlobal("window", undefined);
        vi.stubGlobal("document", undefined);
        vi.stubGlobal("Laya", undefined);
        vi.stubGlobal("lx", undefined);
        const output = vi.spyOn(console, "log").mockImplementation(() => {});
        const errors = vi.spyOn(console, "error").mockImplementation(() => {});
        vi.resetModules();
        const { logger: standalone } = await import("../../src/framework/application/diagnostics/Logger");
        standalone.log("before engine initialization");
        standalone.error("host error output");
        standalone.enabled = false;
        expect(output).toHaveBeenCalledExactlyOnceWith("before engine initialization");
        expect(errors).toHaveBeenCalledExactlyOnceWith("host error output");
        expect(Reflect.get(globalThis, "logger")).toBe(sdkLogger);
        expect(Reflect.get(globalThis, "GameGlobal")).toEqual({ logger: sdkLogger });
        expect(Reflect.get(globalThis, "lx")).toBeUndefined();
        expect(sdkLogger.enabled).toBe(true);
        expect(sdkLogger.log).not.toHaveBeenCalled();
        expect(sdkLogger.error).not.toHaveBeenCalled();
        standalone.enabled = true;
    });
});
