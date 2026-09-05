export interface PendingServiceOperation {
    readonly serviceName: string;
    readonly phase: "start" | "stop";
    readonly elapsedMs: number;
    readonly abandoned: boolean;
}

export class ServiceOperationError extends Error {
    constructor(readonly serviceName: string, readonly phase: "start" | "stop",
        readonly reason: "timeout" | "cancelled", readonly timeoutMs: number) {
        super(`Service '${serviceName}' ${phase} ${reason} (deadline ${timeoutMs}ms).`);
        this.name = "ServiceOperationError";
    }
}

class LateServiceCleanupError extends Error {
    constructor(readonly serviceName: string, readonly cause: unknown) {
        super(`Service '${serviceName}' late cleanup failed: ${cause instanceof Error ? cause.message : String(cause)}`);
        this.name = "LateServiceCleanupError";
    }
}

/** Tracks the actual promises even after the caller's bounded wait has ended. */
export class ServiceOperations {
    private sequence = 0;
    private readonly pending = new Map<number, {
        serviceName: string; phase: "start" | "stop"; startedAt: number; abandoned: boolean;
    }>();
    readonly lateErrors: unknown[] = [];

    snapshot(): readonly PendingServiceOperation[] {
        return Array.from(this.pending.values(), ({ startedAt, ...entry }) =>
            Object.freeze({ ...entry, elapsedMs: Math.max(0, Date.now() - startedAt) }));
    }

    run(serviceName: string, phase: "start" | "stop", timeoutMs: number,
        action: (signal: AbortSignal) => void | Promise<void>,
        signal?: AbortSignal, compensateLate?: () => Promise<void>,
        onLateSettled?: (failed: boolean, cause?: unknown) => void): Promise<void> {
        if (signal?.aborted) {
            return Promise.reject(new ServiceOperationError(serviceName, phase, "cancelled", timeoutMs));
        }
        const id = ++this.sequence;
        const record = { serviceName, phase, startedAt: Date.now(), abandoned: false };
        this.pending.set(id, record);
        const controller = new AbortController();
        return new Promise<void>((resolve, reject) => {
            let settled = false;
            const cleanup = (): void => {
                clearTimeout(timer);
                signal?.removeEventListener("abort", cancel);
            };
            const abandon = (reason: "timeout" | "cancelled"): void => {
                if (settled) return;
                settled = true;
                record.abandoned = true;
                cleanup();
                controller.abort();
                reject(new ServiceOperationError(serviceName, phase, reason, timeoutMs));
            };
            const cancel = (): void => abandon("cancelled");
            const timer = setTimeout(() => abandon("timeout"), timeoutMs);
            signal?.addEventListener("abort", cancel, { once: true });
            let operation: Promise<void>;
            try {
                operation = Promise.resolve(action(controller.signal));
            } catch (error) {
                operation = Promise.reject(error);
            }
            const finish = (error?: unknown, failed = false): void => {
                if (settled) {
                    if (failed && phase === "stop") {
                        this.lateErrors.push(new LateServiceCleanupError(serviceName, error));
                    }
                    try {
                        onLateSettled?.(failed, error);
                        if (compensateLate) {
                            // Keep the original operation visible until compensation
                            // synchronously registers its own actual pending work.
                            void compensateLate().catch((cause: unknown) => {
                                // A deadline only abandons waiting. The actual stop
                                // will report success/failure through onLateSettled.
                                if (!(cause instanceof ServiceOperationError)) {
                                    this.lateErrors.push(new LateServiceCleanupError(serviceName, cause));
                                }
                            });
                        }
                    } catch (cause) {
                        this.lateErrors.push(new LateServiceCleanupError(serviceName, cause));
                    } finally {
                        this.pending.delete(id);
                    }
                    return;
                }
                this.pending.delete(id);
                settled = true;
                cleanup();
                if (failed) reject(error);
                else resolve();
            };
            operation.then(() => finish(), (error: unknown) => finish(error, true));
        });
    }
}
