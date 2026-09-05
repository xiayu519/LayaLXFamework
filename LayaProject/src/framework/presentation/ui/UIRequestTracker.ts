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

/** Owns request cancellation and diagnostics, not native Loader cache ownership. */
export class UIRequestTracker {
    private readonly requests = new Map<number, UIRequest>();
    private sequence = 0;

    begin(routeId: string, signal?: AbortSignal): UIRequest {
        const controller = new AbortController();
        const abort = (): void => controller.abort();
        if (signal?.aborted) abort();
        else signal?.addEventListener("abort", abort, { once: true });
        const request: UIRequest = {
            id: ++this.sequence, routeId, startedAt: Date.now(), controller, phase: "loading",
            unlink: () => signal?.removeEventListener("abort", abort),
        };
        this.requests.set(request.id, request);
        return request;
    }

    finish(request: UIRequest): void {
        request.unlink();
        this.requests.delete(request.id);
    }

    cancel(routeId?: string, window?: object): void {
        for (const request of this.requests.values()) {
            if ((routeId === undefined || request.routeId === routeId)
                && (window === undefined || request.window === window)) {
                request.controller.abort();
            }
        }
    }

    snapshot(): readonly UIRequestInfo[] {
        const now = Date.now();
        return Array.from(this.requests.values(), (request) => Object.freeze({
            id: request.id, routeId: request.routeId, phase: request.phase,
            elapsedMs: Math.max(0, now - request.startedAt),
        }));
    }
}
