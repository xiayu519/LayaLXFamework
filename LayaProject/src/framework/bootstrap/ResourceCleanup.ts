import type { AppService } from "../application/lifecycle/AppService";
import type { AppBootstrap } from "./AppBootstrap";

export interface RuntimeCleanupParticipant {
    readonly name: string;
    stop(): void | Promise<void>;
    drain?(): Promise<void>;
    retry?(): void | Promise<void>;
}

/** 停止各持有者并等待未结束的工作，原生销毁完成后才申请 GC。 */
export class ResourceCleanup implements AppService {
    public readonly name = "resource-cleanup";
    private readonly pending = new Set<string>();
    private gcState: "not-requested" | "requested" | "skipped" = "not-requested";
    private engaged = false;

    public get started(): boolean {
        return this.engaged;
    }

    public constructor(
        private readonly participants: readonly RuntimeCleanupParticipant[],
        private readonly pendingLoadTimeoutMs: number,
        private readonly getBootstrapSnapshot: () => ReturnType<AppBootstrap["snapshot"]> | undefined,
    ) {
    }

    public get pendingCleanup(): readonly string[] {
        return Array.from(this.pending);
    }

    public get gc(): "not-requested" | "requested" | "skipped" {
        return this.gcState;
    }

    public start(): void {
        this.engaged = true;
    }

    public async stop(): Promise<void> {
        this.engaged = true;
        const errors: unknown[] = [];
        const deadline = Date.now() + this.pendingLoadTimeoutMs;
        let safeToCollect = true;
        // 先使所有持有者失效，再等待异步工作结束。
        const stops = this.participants.map(participant => {
            let operation: Promise<void>;
            try {
                operation = Promise.resolve(participant.stop());
            } catch (error) {
                operation = Promise.reject(error);
            }
            return operation.catch(error => {
                errors.push(error);
                if (!participant.retry) {
                    safeToCollect = false;
                }
            });
        });
        const settling = Promise.all(this.participants.map(async (participant, index) => {
            this.pending.add(participant.name);
            try {
                await stops[index];
                await participant.drain?.();
            } catch (error) {
                errors.push(error);
                safeToCollect = false;
            } finally {
                this.pending.delete(participant.name);
            }
        }));
        if (!await this.collectCleanup(errors, () => this.waitWithDeadline(settling, this.pendingLoadTimeoutMs))) {
            safeToCollect = false;
        }
        for (const participant of this.participants) {
            if (participant.retry && !await this.collectCleanup(errors, () => participant.retry!())) {
                safeToCollect = false;
            }
        }
        // 原生组件在帧回调中完成销毁，包括 GLoader 使用的 FrameAnimation。
        // 渲染暂停时必须明确报告超时，不能提前执行 GC 并报告成功。
        if (safeToCollect) {
            const frameOwner = {};
            this.pending.add("native-destruction");
            try {
                const settled = new Promise<void>(resolve => Laya.timer.frameOnce(1, frameOwner, resolve));
                if (!await this.collectCleanup(errors, () => this.waitWithDeadline(settled, Math.max(1, deadline - Date.now())))) {
                    safeToCollect = false;
                }
            } finally {
                Laya.timer.clearAll(frameOwner);
                this.pending.delete("native-destruction");
            }
        }
        const state = this.getBootstrapSnapshot();
        if (state && (state.pending.some((operation) => operation.serviceName !== "resource-cleanup")
            || state.failedStops.length > 0 || state.lateCleanupErrors > 0)) {
            safeToCollect = false;
            errors.push(new Error("Service operations remain incomplete; resource GC was skipped."));
        }
        this.gcState = safeToCollect ? "requested" : "skipped";
        if (safeToCollect) {
            await this.collectCleanup(errors, () => Laya.Scene.gc());
        }
        if (errors.length > 0) {
            throw new ResourceCleanupError([...errors], [...this.pending]);
        }
    }

    private async collectCleanup(
        errors: unknown[],
        action: () => unknown | Promise<unknown>,
    ): Promise<boolean> {
        try {
            await action();
            return true;
        } catch (error) {
            errors.push(error);
            return false;
        }
    }

    private async waitWithDeadline(operation: Promise<unknown>, timeoutMs: number): Promise<void> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            await Promise.race([operation, new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error(`Runtime pending loads exceeded ${timeoutMs}ms; GC skipped.`)), timeoutMs);
            })]);
        } finally {
            clearTimeout(timer);
        }
    }
}

class ResourceCleanupError extends Error {
    public constructor(public readonly errors: readonly unknown[], public readonly pending: readonly string[]) {
        super(`${errors.length} runtime cleanup operation(s) failed.`);
        this.name = "ResourceCleanupError";
    }
}
