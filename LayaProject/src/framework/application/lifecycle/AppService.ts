export interface AppService {
    readonly name: string;
    /** stop 必须可重复调用，并能清理启动部分失败后留下的状态。 */
    start(context?: AppServiceContext): void | Promise<void>;
    stop(context?: AppServiceContext): void | Promise<void>;
}

export interface AppServiceContext {
    /** 异步结果生效前检查取消信号；执行方需要主动配合取消。 */
    readonly signal: AbortSignal;
}

export interface BootstrapProgress {
    readonly serviceName: string;
    readonly completed: number;
    readonly total: number;
}
