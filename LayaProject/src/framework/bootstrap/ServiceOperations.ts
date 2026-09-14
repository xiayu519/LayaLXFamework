export interface PendingServiceOperation {
    readonly serviceName: string;
    readonly phase: "start" | "stop";
    readonly elapsedMs: number;
    readonly abandoned: boolean;
}

export class ServiceOperationError extends Error {
    public constructor(public readonly serviceName: string, public readonly phase: "start" | "stop",
        public readonly reason: "timeout" | "cancelled", public readonly timeoutMs: number) {
        super(`Service '${serviceName}' ${phase} ${reason} (deadline ${timeoutMs}ms).`);
        this.name = "ServiceOperationError";
    }
}

class LateServiceCleanupError extends Error {
    public constructor(public readonly serviceName: string, public readonly cause: unknown) {
        super(`Service '${serviceName}' late cleanup failed: ${cause instanceof Error ? cause.message : String(cause)}`);
        this.name = "LateServiceCleanupError";
    }
}

/** 即使调用方的限时等待已经结束，仍跟踪实际 Promise。 */
export class ServiceOperations {
    private sequence = 0;
    private readonly pending = new Map<number, {
        serviceName: string; phase: "start" | "stop"; startedAt: number; abandoned: boolean;
    }>();
    public readonly lateErrors: unknown[] = [];
    private readonly idleWaiters = new Set<() => void>();

    public waitForIdle(): Promise<void> {
        return this.pending.size ? new Promise(resolve => this.idleWaiters.add(resolve)) : Promise.resolve();
    }

    private complete(id: number): void {
        this.pending.delete(id);
        if (!this.pending.size) {
            for (const resolve of this.idleWaiters) resolve();
            this.idleWaiters.clear();
        }
    }

    public snapshot(): readonly PendingServiceOperation[] {
        return Array.from(this.pending.values(), ({ startedAt, ...entry }) =>
            Object.freeze({ ...entry, elapsedMs: Math.max(0, Date.now() - startedAt) }));
    }

    public run(serviceName: string, phase: "start" | "stop", timeoutMs: number,
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
                if (settled) {
                    return;
                }
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
                            // 保留原始操作记录，直到补偿流程
                            // 同步登记其实际尚未完成的工作。
                            void compensateLate().catch((cause: unknown) => {
                                // 超过时限只结束等待；实际停止的
                                // 成功或失败仍由 onLateSettled 报告。
                                if (!(cause instanceof ServiceOperationError)) {
                                    this.lateErrors.push(new LateServiceCleanupError(serviceName, cause));
                                }
                            });
                        }
                    } catch (cause) {
                        this.lateErrors.push(new LateServiceCleanupError(serviceName, cause));
                    } finally {
                        this.complete(id);
                    }
                    return;
                }
                this.complete(id);
                settled = true;
                cleanup();
                if (failed) {
                    reject(error);
                } else {
                    resolve();
                }
            };
            operation.then(() => finish(), (error: unknown) => finish(error, true));
        });
    }
}
