import { afterEach, describe, expect, it, vi } from "vitest";
import { NetworkService } from "../../src/framework/infrastructure/network/NetworkService";

class Socket {
    public readonly input = { clear: vi.fn() };
    public readonly output = { clear: vi.fn() };
    public readonly connectByUrl = vi.fn();
    public readonly close = vi.fn();
    private listeners: { type: string; caller: unknown; method: () => void; once: boolean }[] = [];

    public on(type: string, caller: unknown, method: () => void): void {
        this.listeners.push({ type, caller, method, once: false });
    }

    public once(type: string, caller: unknown, method: () => void): void {
        this.listeners.push({ type, caller, method, once: true });
    }

    public offAll(): void { this.listeners = []; }
    public hasListener(type: string): boolean { return this.listeners.some(listener => listener.type === type); }

    public event(type: string): void {
        for (const listener of [...this.listeners].filter(item => item.type === type)) {
            if (listener.once) this.listeners = this.listeners.filter(item => item !== listener);
            listener.method.call(listener.caller);
        }
    }
}

afterEach(() => vi.unstubAllGlobals());

describe("native network ownership", () => {
    it("does not connect on startup and retires callers before asynchronous native close", () => {
        vi.stubGlobal("Laya", { Socket, Event: { ERROR: "error", CLOSE: "close" } });
        const network = new NetworkService();
        const socket = network.socket;
        const received = vi.fn(), error = vi.fn();
        socket.on("message", {}, received);
        socket.on("error", {}, error);
        network.start();
        expect(socket.connectByUrl).not.toHaveBeenCalled();
        network.stop();
        network.stop();
        expect(socket.close).toHaveBeenCalledOnce();
        socket.event("message");
        socket.event("error");
        expect(received).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
        // PAL 关闭期间若无 ERROR 监听器，原生 Socket 会调用 console.error。
        expect(socket.hasListener("error")).toBe(true);
        socket.event("close");
        expect(socket.hasListener("error")).toBe(false);
        expect(socket.input.clear).toHaveBeenCalledOnce();
        expect(socket.output.clear).toHaveBeenCalledOnce();
        expect(() => network.socket).toThrow("stopped");
        expect(() => network.start()).toThrow("stopped");
    });
});
