import type { BaseGameWindow } from "./BaseGameWindow";

export interface UIWindowCleanupDiagnostic {
    readonly routeId: string;
    readonly attempts: number;
    readonly retryable: boolean;
    readonly error: unknown;
}

export interface CleanupWindowRecord {
    readonly route: { readonly id: string };
    readonly window: BaseGameWindow<unknown>;
    cleanupFailure?: UIWindowCleanupDiagnostic;
}

export function getWindowCleanupDiagnostic(record: CleanupWindowRecord): UIWindowCleanupDiagnostic | undefined {
    const failure = record.window.destructionFailure;
    if (!failure) {
        return record.cleanupFailure;
    }
    return Object.freeze({
        routeId: record.route.id, attempts: record.cleanupFailure?.attempts ?? 1,
        retryable: false, error: failure
    });
}

/** 清理失败时保留持有记录；不能把原生 destroyed 标记视为清理已恢复。 */
export function destroyManagedWindow(record: CleanupWindowRecord): void {
    const previous = getWindowCleanupDiagnostic(record);
    if (previous && !previous.retryable) {
        throw previous.error;
    }
    try {
        if (!record.window.destructionComplete) {
            record.window.destroy();
        }
        if (!record.window.destructionComplete) {
            throw new Error("UI window destruction did not complete.");
        }
        record.cleanupFailure = undefined;
    } catch (error) {
        record.cleanupFailure = Object.freeze({
            routeId: record.route.id,
            attempts: (previous?.attempts ?? 0) + 1,
            retryable: !record.window.destroyed && !record.window.destructionFailure,
            error
        });
        throw error;
    }
}
