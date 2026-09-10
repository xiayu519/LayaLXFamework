export type WorldCleanup = () => void | Promise<void>;

/** Registration and cleanup scope. Actual Scene and UI instances stay with their managers. */
export interface WorldContext {
    readonly id: string;
    readonly signal: AbortSignal;
    /** Own the undo operation immediately after each successful initialization step. */
    own(cleanup: WorldCleanup): void;
}

export interface WorldDefinition {
    readonly id: string;
    /** Await all initialization work so exit can drain its late registrations and resources. */
    initialize(context: WorldContext): void | Promise<void>;
}

export interface WorldSnapshot {
    readonly id: string;
    readonly state: "initializing" | "active" | "exiting" | "cleanup-failed";
    readonly pendingInitialization: boolean;
    readonly pendingCleanups: number;
    readonly cleanupFailures: number;
}

export interface WorldRegistrySnapshot {
    readonly registered: readonly string[];
    readonly worlds: readonly WorldSnapshot[];
    readonly pendingLoads: number;
    readonly cleanupFailures: number;
}
