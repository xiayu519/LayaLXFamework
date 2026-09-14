import type { WorldCleanup, WorldContext } from "../application/world/WorldDefinition";
import type { AppService } from "../application/lifecycle/AppService";
import { LifetimeCleanupError } from "../application/lifecycle/LifetimeScope";
import type { UIViewRoute } from "../presentation/ui/UIViewRoute";
import type { SceneRoute, SceneOpenOptions } from "../presentation/scene/SceneFlow";
import type { BaseGameScene } from "../presentation/scene/BaseGameScene";
import type { lx } from "../lx";
import { AppBootstrap } from "./AppBootstrap";

interface WorldSubscription {
    readonly source: Laya.EventDispatcher;
    readonly type: string;
    readonly caller: object;
    readonly listener: unknown;
    off(): void;
}

/** 登记引擎对象的持有与清理关系；事件派发、加载和 UI 继续使用原生能力或已有管理器。 */
export class WorldScope implements WorldContext {
    public readonly events = new Laya.EventDispatcher();
    private readonly subscriptions = new Set<WorldSubscription>();
    private readonly callers = new Set<object>();
    private readonly pending = new Set<Promise<unknown>>();
    private readonly sceneRoutes = new Set<SceneRoute<unknown>>();
    private readonly invalidationErrors: unknown[] = [];

    public constructor(private readonly context: WorldContext,
        private readonly managers: Pick<typeof lx, "ui" | "scenes">) {
        // 最先登记、最后清理，确保 Scene、UI 和模块的持有者均已失效。
        context.own(async () => {
            this.invalidate();
            await this.waitForPendingLoads();
            if (this.invalidationErrors.length) {
                throw new LifetimeCleanupError(this.invalidationErrors);
            }
        });
        context.signal.addEventListener("abort", this.invalidate, { once: true });
    }

    public get id(): string {
        return this.context.id;
    }

    public get signal(): AbortSignal {
        return this.context.signal;
    }

    public own(cleanup: WorldCleanup): void {
        this.context.own(cleanup);
    }

    /** 原生 on 注册并记录订阅；退出开始时自动 off，只移除本次 World 的监听。 */
    public listen<TArgs extends unknown[]>(source: Laya.EventDispatcher, type: string,
        caller: object, listener: (...args: TArgs) => void): () => void {
        this.signal.throwIfAborted();
        const existing = [...this.subscriptions].find(subscription => subscription.source === source
            && subscription.type === type && subscription.caller === caller && subscription.listener === listener);
        if (existing) {
            return existing.off;
        }
        source.on(type, caller, listener);
        let active = true;
        const off = (): void => {
            if (!active) {
                return;
            }
            source.off(type, caller, listener);
            active = false;
            this.subscriptions.delete(subscription);
        };
        const subscription: WorldSubscription = { source, type, caller, listener, off };
        this.subscriptions.add(subscription);
        return off;
    }

    /**
     * 登记原生 timer/Tween 的 caller/target；退出开始时自动 clearAll/killAll。
     * callLater 属于独立队列，需用 own 登记对应的 clearCallLater(caller, method)。
     */
    public ownCaller(caller: object): void {
        this.signal.throwIfAborted();
        this.callers.add(caller);
    }

    /** 注册本 World 专属 UI；退出时销毁该路由的实例并注销定义。 */
    public registerView<TArgs, TView extends Laya.GWidget>(definition: UIViewRoute<TArgs, TView>): UIViewRoute<TArgs, TView> {
        this.signal.throwIfAborted();
        const route = this.managers.ui.registerView({ ...definition });
        this.own(() => this.managers.ui.unregisterView(route));
        return route;
    }

    /** 注册本 World 专属 Scene；退出时卸载场景及其 UI，再注销定义。 */
    public registerScene<TArgs>(definition: SceneRoute<TArgs>): SceneRoute<TArgs> {
        this.signal.throwIfAborted();
        const route = this.managers.scenes.register({ ...definition });
        this.sceneRoutes.add(route);
        this.own(async () => {
            await this.managers.scenes.unregister(route);
            this.sceneRoutes.delete(route);
        });
        return route;
    }

    public openScene<TArgs>(route: SceneRoute<TArgs>, args: NoInfer<TArgs>,
        options?: Omit<SceneOpenOptions, "signal">): Promise<BaseGameScene<TArgs>> {
        this.signal.throwIfAborted();
        if (!this.sceneRoutes.has(route)) {
            throw new Error(`Scene is not owned by World '${this.id}': ${route.id}`);
        }
        return this.track(this.managers.scenes.open(route, args, { ...options, signal: this.signal }));
    }

    /** World 内部模块复用已有的超时、回滚和延迟启动补偿机制。 */
    public async startServices(services: readonly AppService[]): Promise<void> {
        this.signal.throwIfAborted();
        const bootstrap = new AppBootstrap(services);
        const stop = (): void => {
            if (bootstrap.state === "starting") {
                void bootstrap.stop().catch(() => {
                });
            }
        };
        this.signal.addEventListener("abort", stop, { once: true });
        this.own(async () => {
            this.signal.removeEventListener("abort", stop);
            try {
                await bootstrap.stop();
            } finally {
                await bootstrap.waitForPendingOperations();
            }
        });
        await this.track(bootstrap.start());
        this.signal.throwIfAborted();
    }

    /** 跟踪原始工作；将结果写回当前 World 前必须检查 signal。 */
    public track<T>(operation: Promise<T>): Promise<T> {
        this.pending.add(operation);
        void operation.then(() => this.pending.delete(operation), () => this.pending.delete(operation));
        return operation;
    }

    /** 这里只登记独占资源的清理，不强制清除共享 Loader 缓存。 */
    public ownResource<T>(resource: T, release: (resource: T) => void | Promise<void>): T {
        this.own(async () => {
            await this.waitForPendingLoads();
            await release(resource);
        });
        return resource;
    }

    private async waitForPendingLoads(): Promise<void> {
        while (this.pending.size) {
            await Promise.allSettled([...this.pending]);
        }
    }

    /** 退出先停副作用；随后 WorldRegistry 才按登记顺序的逆序清理 Scene、UI 和业务内容。 */
    private readonly invalidate = (): void => {
        this.signal.removeEventListener("abort", this.invalidate);
        const actions = [...this.subscriptions].map(subscription => subscription.off).concat([
            ...[...this.callers].flatMap(caller => [() => Laya.timer.clearAll(caller), () => Laya.Tween.killAll(caller)]),
            () => this.events.offAll()]);
        this.subscriptions.clear();
        this.callers.clear();
        for (const action of actions) {
            try {
                action();
            } catch (error) {
                this.invalidationErrors.push(error);
            }
        }
    };
}
