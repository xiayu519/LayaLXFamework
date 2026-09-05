import type { ApplicationRuntime } from "./createRuntime";

let attachedRuntime: ApplicationRuntime | undefined;
const QUARANTINE_RECHECK_MS = 25;
const MAX_QUARANTINE_RECHECK_MS = 1_000;

interface QuarantinedRuntime {
    runtime: ApplicationRuntime | undefined;
    timer: ReturnType<typeof setTimeout> | undefined;
    recheckMs: number;
}

const quarantinedRuntimes = new Set<QuarantinedRuntime>();

/** @internal Used only by the framework bootstrap to attach a runtime. */
export function bindLXRuntime(runtime: ApplicationRuntime): void {
    if (attachedRuntime && attachedRuntime !== runtime) {
        throw new Error("LX already has an attached runtime.");
    }
    for (const retired of quarantinedRuntimes) {
        const status = inspectCleanup(retired.runtime);
        if (status !== "complete") {
            if (status === "settling") scheduleCleanupRecheck(retired);
            throw new Error("LX cannot attach a runtime while previous runtime cleanup remains incomplete. Inspect its snapshot.");
        }
        releaseQuarantine(retired);
    }
    attachedRuntime = runtime;
}

/** @internal Used only by the framework bootstrap to detach a runtime. */
export function unbindLXRuntime(runtime: ApplicationRuntime): void {
    if (attachedRuntime === runtime) {
        attachedRuntime = undefined;
        const status = inspectCleanup(runtime);
        if (status === "complete") return;

        // Never expose a retired runtime through LX. Keep it only while the
        // fail-closed guard needs diagnostics; late bounded cleanup is observed
        // until it becomes provably clean, without requiring another bind.
        const retired: QuarantinedRuntime = { runtime, timer: undefined, recheckMs: QUARANTINE_RECHECK_MS };
        quarantinedRuntimes.add(retired);
        if (status === "settling") scheduleCleanupRecheck(retired);
    }
}

/** @internal Used by the public read-only facade to inspect the runtime. */
export function getLXRuntime(): ApplicationRuntime | undefined {
    return attachedRuntime;
}

/** @internal Used by the public read-only facade to require the attached runtime. */
export function requireLXRuntime(): ApplicationRuntime {
    if (!attachedRuntime) {
        throw new Error("LX runtime is not attached.");
    }
    return attachedRuntime;
}

type CleanupStatus = "complete" | "settling" | "incomplete";

function inspectCleanup(runtime: ApplicationRuntime | undefined): CleanupStatus {
    if (!runtime) return "incomplete";
    try {
        const state = runtime.snapshot();
        const complete = state.bootstrap.state === "stopped"
            && state.bootstrap.activeServices.length === 0
            && state.bootstrap.pending.length === 0
            && state.bootstrap.failedStops.length === 0
            && state.bootstrap.lateCleanupErrors === 0
            && state.pendingCleanup.length === 0
            && state.ui.nativeLoads === 0
            && state.ui.pendingRequests.length === 0
            && state.ui.managed.length === 0
            && state.ui.cleanupFailures === 0
            && state.ui.tips.active === 0 && state.ui.tips.queued === 0
            && state.pools.every((pool) => pool.active === 0 && pool.pending === 0
                && pool.idle === 0 && !pool.loading && pool.cleanupFailures === 0)
            && state.config.length === 0;
        if (complete) return "complete";

        const settling = state.bootstrap.pending.length > 0
            || state.pendingCleanup.length > 0
            || state.ui.nativeLoads > 0
            || state.ui.pendingRequests.length > 0
            || state.pools.some((pool) => pool.pending > 0 || pool.loading);
        return settling ? "settling" : "incomplete";
    } catch {
        // Missing/unreadable diagnostics cannot establish that late work is safe.
        return "incomplete";
    }
}

function scheduleCleanupRecheck(retired: QuarantinedRuntime): void {
    if (retired.timer !== undefined || !retired.runtime || !quarantinedRuntimes.has(retired)) return;
    retired.timer = setTimeout(() => {
        retired.timer = undefined;
        if (!retired.runtime || !quarantinedRuntimes.has(retired)) return;
        const status = inspectCleanup(retired.runtime);
        if (status === "complete") {
            releaseQuarantine(retired);
        } else if (status === "settling") {
            scheduleCleanupRecheck(retired);
        }
    }, retired.recheckMs);
    retired.recheckMs = Math.min(retired.recheckMs * 2, MAX_QUARANTINE_RECHECK_MS);
    (retired.timer as ReturnType<typeof setTimeout> & { unref?: () => void }).unref?.();
}

function releaseQuarantine(retired: QuarantinedRuntime): void {
    if (retired.timer !== undefined) clearTimeout(retired.timer);
    retired.timer = undefined;
    retired.runtime = undefined;
    quarantinedRuntimes.delete(retired);
}
