import { AbortController as PolyfillAbortController } from "abort-controller/dist/abort-controller";

/** 优先使用宿主原生取消对象；旧宿主复用标准兼容库，不修改全局构造器或原型。 */
export function createAbortController(): AbortController {
    // 显式导入 dist，避免包的 browser 入口再次返回缺失的宿主构造器。
    const Controller = globalThis.AbortController ?? PolyfillAbortController;
    const controller = new Controller() as AbortController;
    const signal = controller.signal;
    if (!Reflect.has(signal, "reason")) {
        const abort = controller.abort.bind(controller);
        Object.defineProperty(signal, "reason", { configurable: true, value: undefined });
        controller.abort = (reason?: unknown): void => {
            if (signal.aborted) {
                return;
            }
            const failure = reason === undefined ? createAbortError() : reason;
            // 原生派发是同步的，监听执行前就必须能读取原因。
            Object.defineProperty(signal, "reason", { configurable: true, value: failure });
            abort();
        };
    }
    if (typeof signal.throwIfAborted !== "function") {
        Object.defineProperty(signal, "throwIfAborted", { configurable: true, value: function (this: AbortSignal): void {
            if (this.aborted) {
                throw this.reason;
            }
        } });
    }
    return controller;
}

function createAbortError(): Error {
    return typeof DOMException === "function"
        ? new DOMException("This operation was aborted", "AbortError")
        : Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
}
