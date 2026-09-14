import { createAbortController } from "../../application/lifecycle/createAbortController";
export interface UIRequestInfo {
    readonly id: number;
    readonly routeId: string;
    readonly phase: "loading" | "binding";
    readonly elapsedMs: number;
}

export interface UIRequest {
    readonly id: number;
    readonly routeId: string;
    readonly startedAt: number;
    readonly controller: AbortController;
    readonly unlink: () => void;
    phase: UIRequestInfo["phase"];
    window?: object;
}

/** 负责请求取消与诊断，不接管原生 Loader 缓存。 */
export class UIRequestTracker {
    private readonly requests = new Map<number, UIRequest>();
    private sequence = 0;

    public begin(routeId: string, signal?: AbortSignal): UIRequest {
        const controller = createAbortController();
        const abort = (): void => controller.abort();
        if (signal?.aborted) {
            abort();
        } else {
            signal?.addEventListener("abort", abort, { once: true });
        }
        const request: UIRequest = {
            id: ++this.sequence, routeId, startedAt: Date.now(), controller, phase: "loading",
            unlink: () => signal?.removeEventListener("abort", abort),
        };
        this.requests.set(request.id, request);
        return request;
    }

    public finish(request: UIRequest): void {
        request.unlink();
        this.requests.delete(request.id);
    }

    public cancel(routeId?: string, window?: object): void {
        for (const request of this.requests.values()) {
            if ((routeId === undefined || request.routeId === routeId)
                && (window === undefined || request.window === window)) {
                request.controller.abort();
            }
        }
    }

    public snapshot(): readonly UIRequestInfo[] {
        const now = Date.now();
        return Array.from(this.requests.values(), (request) => Object.freeze({
            id: request.id, routeId: request.routeId, phase: request.phase,
            elapsedMs: Math.max(0, now - request.startedAt),
        }));
    }
}
