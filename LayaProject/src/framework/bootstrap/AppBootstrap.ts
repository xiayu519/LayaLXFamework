import type { AppService, BootstrapProgress } from "../application/lifecycle/AppService";
import { ServiceOperations } from "./ServiceOperations";

export type { AppService, BootstrapProgress } from "../application/lifecycle/AppService";

export type BootstrapState = "idle" | "starting" | "running" | "stopping" | "stopped";

export interface BootstrapOptions {
    readonly startTimeoutMs?: number;
    readonly stopTimeoutMs?: number;
    /** 报告模块实际完成进度；进度监听器失败也会触发启动回滚。 */
    readonly onProgress?: (progress: BootstrapProgress) => void;
}

export class BootstrapStartError extends Error {
    public constructor(
        public readonly serviceName: string,
        public readonly cause: unknown,
        public readonly rollbackErrors: readonly unknown[],
    ) {
        super(`Service '${serviceName}' failed to start: ${describeCause(cause)}`);
        this.name = "BootstrapStartError";
    }
}

function describeCause(cause: unknown): string {
    return cause instanceof Error ? cause.message : String(cause);
}

export class BootstrapStopError extends Error {
    public constructor(public readonly errors: readonly unknown[]) {
        super(`${errors.length} service(s) failed to stop.`);
        this.name = "BootstrapStopError";
    }
}

export class AppBootstrap {
    private readonly activeServices: AppService[] = [];
    private currentState: BootstrapState = "idle";
    private startTask: Promise<void> | undefined;
    private stopTask: Promise<void> | undefined;
    private readonly operations = new ServiceOperations();
    private readonly startController = new AbortController();
    private readonly failedStops = new Set<string>();
    private readonly latestStopAttempts = new Map<string, number>();
    private stopSequence = 0;
    private readonly startTimeoutMs: number;
    private readonly stopTimeoutMs: number;
    private onProgress: BootstrapOptions["onProgress"];

    public constructor(private services: readonly AppService[], options: BootstrapOptions = {}) {
        this.onProgress = options.onProgress;
        this.startTimeoutMs = deadline(options.startTimeoutMs ?? 30_000);
        this.stopTimeoutMs = deadline(options.stopTimeoutMs ?? 10_000);
        const names = new Set<string>();
        for (const service of services) {
            if (names.has(service.name)) {
                throw new Error(`Duplicate service name '${service.name}'.`);
            }
            names.add(service.name);
        }
    }

    public get state(): BootstrapState {
        return this.currentState;
    }

    /** 有时限的停止等待结束后，继续等待实际操作及延迟启动的补偿清理。 */
    public async waitForPendingOperations(): Promise<void> {
        await this.operations.waitForIdle();
        if (this.failedStops.size || this.operations.lateErrors.length) {
            throw new BootstrapStopError([
                ...[...this.failedStops].map(name => new Error(`Service has not stopped: ${name}`)),
                ...this.operations.lateErrors,
            ]);
        }
    }

    public snapshot() {
        return Object.freeze({
            state: this.currentState,
            activeServices: this.activeServices.map((service) => service.name),
            pending: this.operations.snapshot(), failedStops: [...this.failedStops],
            lateCleanupErrors: this.operations.lateErrors.length,
            lateCleanupFailures: this.operations.lateErrors.map(describeCause)
        });
    }

    public start(): Promise<void> {
        if (this.currentState === "running") {
            return Promise.resolve();
        }
        if (this.currentState === "starting") {
            return this.startTask ?? Promise.reject(new Error("Bootstrap start operation is missing."));
        }
        if (this.currentState === "stopping" || this.currentState === "stopped") {
            return Promise.reject(new Error(`Cannot start while bootstrap state is '${this.currentState}'.`));
        }

        this.currentState = "starting";
        // 先保存共享任务，再调用可能重入 start/stop 的业务模块。
        let resolve!: () => void;
        let reject!: (error: unknown) => void;
        const operation = new Promise<void>((done, fail) => {
            resolve = done;
            reject = fail;
        });
        this.startTask = operation;
        void this.startServices().then(resolve, reject);
        operation.then(
            () => this.clearStartTask(operation),
            () => this.clearStartTask(operation),
        );
        return operation;
    }

    public stop(): Promise<void> {
        if (this.stopTask) {
            return this.stopTask;
        }
        if (this.currentState === "idle" || this.currentState === "stopped") {
            this.currentState = "stopped";
            this.services = [];
            return Promise.resolve();
        }
        if (this.currentState === "starting") {
            const startTask = this.startTask;
            if (!startTask) {
                return Promise.reject(new Error("Bootstrap start operation is missing."));
            }
            this.currentState = "stopping";
            const operation = this.trackStop(this.stopAfterStart(startTask));
            this.startController.abort();
            return operation;
        }

        this.currentState = "stopping";
        return this.trackStop(Promise.resolve().then(() => this.stopServices()));
    }

    private async startServices(): Promise<void> {
        let completed = 0;
        for (const service of this.services) {
            try {
                this.activeServices.push(service);
                this.onProgress?.({ serviceName: service.name, completed, total: this.services.length });
                await this.operations.run(service.name, "start", this.startTimeoutMs,
                    (signal) => service.start({ signal }), this.startController.signal,
                    () => this.stopService(service));
                completed += 1;
                this.onProgress?.({ serviceName: service.name, completed, total: this.services.length });
            } catch (cause) {
                const rollbackErrors = await this.stopActiveServices();
                this.currentState = "stopped";
                this.services = [];
                throw new BootstrapStartError(service.name, cause, rollbackErrors);
            }
        }
        this.currentState = "running";
    }

    private async stopAfterStart(startTask: Promise<void>): Promise<void> {
        try {
            await startTask;
        } catch {
            // startServices 已清理部分启动状态，并回滚已启动的模块。
            if (this.failedStops.size > 0) {
                throw new BootstrapStopError([...this.failedStops].map((name) =>
                    new Error(`Service '${name}' rollback remains incomplete.`)));
            }
            return;
        }
        if (this.currentState !== "running") {
            return;
        }

        this.currentState = "stopping";
        await this.stopServices();
    }

    private async stopServices(): Promise<void> {
        const errors = await this.stopActiveServices();
        this.currentState = "stopped";
        this.services = [];
        if (errors.length > 0) {
            throw new BootstrapStopError(errors);
        }
    }

    private trackStop(operation: Promise<void>): Promise<void> {
        this.stopTask = operation;
        operation.then(
            () => this.clearStopTask(operation),
            () => this.clearStopTask(operation),
        );
        return operation;
    }

    private clearStartTask(operation: Promise<void>): void {
        if (this.startTask === operation) {
            this.startTask = undefined;
            this.onProgress = undefined;
        }
    }

    private clearStopTask(operation: Promise<void>): void {
        if (this.stopTask === operation) {
            this.stopTask = undefined;
        }
    }

    private async stopActiveServices(): Promise<unknown[]> {
        const errors: unknown[] = [];
        for (let index = this.activeServices.length - 1; index >= 0; index -= 1) {
            try {
                await this.stopService(this.activeServices[index]);
            } catch (error) {
                errors.push(error);
            }
        }
        this.activeServices.length = 0;
        return errors;
    }

    private async stopService(service: AppService): Promise<void> {
        const attempt = ++this.stopSequence;
        this.latestStopAttempts.set(service.name, attempt);
        let actualSucceeded = false;
        const recordResult = (failed: boolean): void => {
            if (this.latestStopAttempts.get(service.name) !== attempt) {
                return;
            }
            if (failed) {
                this.failedStops.add(service.name);
            } else {
                this.failedStops.delete(service.name);
            }
        };
        try {
            await this.operations.run(service.name, "stop", this.stopTimeoutMs,
                (signal) => service.stop({ signal }), undefined, undefined,
                (failed) => {
                    actualSucceeded = !failed;
                    recordResult(failed);
                });
            recordResult(false);
        } catch (error) {
            // 取消监听器可能在此失败处理执行前就完成实际停止，
            // 因此不能覆盖已经确认的停止成功结果。
            recordResult(!actualSucceeded);
            throw error;
        }
    }
}

function deadline(value: number): number {
    if (!Number.isFinite(value) || value <= 0 || value > 2_147_483_647) {
        throw new Error("Service deadlines must be positive finite timer durations.");
    }
    return value;
}
