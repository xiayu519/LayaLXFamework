export interface AppService {
    readonly name: string;
    /** Stop must be idempotent and able to compensate a partially failed start. */
    start(context?: AppServiceContext): void | Promise<void>;
    stop(context?: AppServiceContext): void | Promise<void>;
}

export interface AppServiceContext {
    /** Check before publishing asynchronous side effects. Cancellation is cooperative. */
    readonly signal: AbortSignal;
}
