import { afterEach, describe, expect, it, vi } from "vitest";
import { AbortController as PolyfillAbortController } from "abort-controller/dist/abort-controller";
import { createAbortController } from "../../src/framework/application/lifecycle/createAbortController";
import { AppBootstrap } from "../../src/framework/bootstrap/AppBootstrap";
import { WorldRegistry } from "../../src/framework/application/world/WorldRegistry";
import { AsyncBindingGuard, awaitBinding } from "../../src/framework/application/ui/AsyncBindingGuard";

const NativeAbortController = globalThis.AbortController;

afterEach(() => vi.unstubAllGlobals());

describe("宿主取消能力兼容", () => {
    it("原生完整时保留原对象和方法，不写全局", () => {
        const controller = createAbortController();
        expect(controller).toBeInstanceOf(NativeAbortController);
        expect(Object.getOwnPropertyDescriptor(controller, "abort")).toBeUndefined();
        expect(Object.getOwnPropertyDescriptor(controller.signal, "throwIfAborted")).toBeUndefined();
        expect(globalThis.AbortController).toBe(NativeAbortController);
    });

    it.each([undefined, PolyfillAbortController])("缺失或旧构造器仍支持原因、重复取消和精确解绑：%s", Controller => {
        vi.stubGlobal("AbortController", Controller);
        vi.stubGlobal("DOMException", undefined);
        const controller = createAbortController();
        const removed = vi.fn(), once = vi.fn(), reasons: unknown[] = [];
        controller.signal.addEventListener("abort", removed);
        controller.signal.removeEventListener("abort", removed);
        controller.signal.addEventListener("abort", once, { once: true });
        controller.signal.addEventListener("abort", () => reasons.push(controller.signal.reason));
        expect(controller.signal.reason).toBeUndefined();
        controller.signal.throwIfAborted();
        const reason = new Error("world exited");
        controller.abort(reason);
        controller.abort(new Error("duplicate"));
        expect(controller.signal.aborted).toBe(true);
        expect(reasons).toEqual([reason]);
        expect(once).toHaveBeenCalledOnce();
        expect(removed).not.toHaveBeenCalled();
        expect(() => controller.signal.throwIfAborted()).toThrow(reason);
        expect(globalThis.AbortController).toBe(Controller);
        const defaultReason = createAbortController();
        defaultReason.abort();
        expect(defaultReason.signal.reason).toMatchObject({ name: "AbortError" });
        expect(() => defaultReason.signal.throwIfAborted()).toThrow(defaultReason.signal.reason);
    });

    it("仅补原生缺失方法，保留原生原因和监听行为", () => {
        class LegacyController extends NativeAbortController {
            public constructor() {
                super();
                Object.defineProperty(this.signal, "throwIfAborted", { configurable: true, value: undefined });
            }
        }
        vi.stubGlobal("AbortController", LegacyController);
        const controller = createAbortController();
        controller.abort(null);
        expect(controller.signal.reason).toBeNull();
        expect(() => controller.signal.throwIfAborted()).toThrow();
        expect(Object.getOwnPropertyDescriptor(controller, "abort")).toBeUndefined();
    });

    it("没有浏览器取消 API 时，实际启动、World 退出和晚到展示仍完成清理", async () => {
        vi.stubGlobal("AbortController", undefined);
        vi.stubGlobal("AbortSignal", undefined);
        vi.stubGlobal("DOMException", undefined);
        const stopped = vi.fn(), cleaned = vi.fn();
        const bootstrap = new AppBootstrap([{ name: "module", start(context) { context!.signal.throwIfAborted(); }, stop: stopped }]);
        await bootstrap.start();
        const worlds = new WorldRegistry();
        worlds.register({ id: "battle", initialize(context) {
            context.signal.throwIfAborted();
            context.own(cleaned);
        } });
        const world = await worlds.enter("battle");
        const guard = new AsyncBindingGuard();
        const token = guard.next(world.signal);
        let finish!: (value: number) => void;
        const original = new Promise<number>(resolve => { finish = resolve; });
        const waiting = awaitBinding(original, token.signal);
        const cancelled = expect(waiting).rejects.toThrow();
        await worlds.exit("battle");
        await cancelled;
        finish(7);
        await original;
        expect(world.signal.aborted).toBe(true);
        expect(token.isCurrent()).toBe(false);
        expect(cleaned).toHaveBeenCalledOnce();
        await bootstrap.stop();
        expect(stopped).toHaveBeenCalledOnce();
        expect(bootstrap.state).toBe("stopped");
    });
});
