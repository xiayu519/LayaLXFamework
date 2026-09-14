import { createAbortController } from "../lifecycle/createAbortController";
export interface BindingToken {
    readonly version: number;
    readonly signal: AbortSignal;
    isCurrent(): boolean;
    commit(action: () => void): boolean;
}

export class AsyncBindingGuard {
    private revision = 0;
    private disposed = false;
    private controller: AbortController | undefined;

    public next(parentSignal?: AbortSignal): BindingToken {
        if (this.disposed) {
            throw new Error("Cannot create a binding token after disposal.");
        }
        this.invalidate();
        const version = ++this.revision;
        const controller = createAbortController();
        this.controller = controller;
        if (parentSignal) {
            const abort = (): void => controller.abort();
            if (parentSignal.aborted) {
                abort();
            } else {
                parentSignal.addEventListener("abort", abort, { once: true });
                controller.signal.addEventListener("abort", () => {
                    parentSignal.removeEventListener("abort", abort);
                }, { once: true });
            }
        }
        const isCurrent = (): boolean => !this.disposed && !controller.signal.aborted
            && version === this.revision;
        return {
            version,
            signal: controller.signal,
            isCurrent,
            commit(action: () => void): boolean {
                if (!isCurrent()) {
                    return false;
                }
                action();
                return true;
            },
        };
    }

    public invalidate(): void {
        if (!this.disposed) {
            this.revision += 1;
        }
        const controller = this.controller;
        this.controller = undefined;
        controller?.abort();
    }

    public dispose(): void {
        this.disposed = true;
        this.revision += 1;
        this.invalidate();
    }
}

export class BindingCancelledError extends Error {
    public constructor() {
        super("Request was cancelled or superseded.");
        this.name = "BindingCancelledError";
    }
}

/** 取消时结束等待，但保留回调以处理之后才返回的失败。 */
export function awaitBinding<T>(operation: T | PromiseLike<T>, signal: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const abort = (): void => {
            signal.removeEventListener("abort", abort);
            reject(new BindingCancelledError());
        };
        if (signal.aborted) {
            abort();
        } else {
            signal.addEventListener("abort", abort, { once: true });
        }
        Promise.resolve(operation).then(
            (value) => {
                signal.removeEventListener("abort", abort);
                resolve(value);
            },
            (error: unknown) => {
                signal.removeEventListener("abort", abort);
                reject(error);
            },
        );
    });
}
