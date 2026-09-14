export type WorldCleanup = () => void | Promise<void>;

/** 登记注册项与清理责任；实际 Scene 和 UI 实例仍由各自管理器持有。 */
export interface WorldContext {
    readonly id: string;
    readonly signal: AbortSignal;
    /** 每步初始化成功后，立即登记对应的撤销操作。 */
    own(cleanup: WorldCleanup): void;
}

export interface WorldDefinition<TContext extends WorldContext = WorldContext> {
    readonly id: string;
    /** 等待所有初始化工作，使退出流程能清理取消后才完成的注册和资源。 */
    initialize(context: TContext): void | Promise<void>;
}

/** 保留注册定义；每次激活都创建新的可变 World 实例。 */
export interface WorldFactory<TContext extends WorldContext = WorldContext> {
    readonly id: string;
    create(): WorldDefinition<TContext>;
}

export type WorldRegistration<TContext extends WorldContext = WorldContext> = WorldDefinition<TContext> | WorldFactory<TContext>;

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
