import type { SceneUI } from "./SceneUI";
import type { UIViewRoute } from "./UIViewRoute";
import { LifetimeCleanupError } from "../../application/lifecycle/LifetimeScope";

type ViewRoute = UIViewRoute<unknown>;

/** 定义只包含资源地址和可选依赖注入，不保存预制体实例。 */
export class UIViewRegistry {
    private readonly routes = new Map<string, ViewRoute>();
    private readonly withdrawing = new Set<ViewRoute>();
    private readonly unloading = new Map<ViewRoute, Promise<void>>();

    public has(id: string): boolean {
        return this.routes.has(id);
    }

    public get(id: string): ViewRoute | undefined {
        const route = this.routes.get(id);
        return route && !this.withdrawing.has(route) ? route : undefined;
    }

    public set<TArgs, TView extends Laya.GWidget>(route: UIViewRoute<TArgs, TView>): void {
        this.routes.set(route.id, route as unknown as ViewRoute);
    }

    public clear(): void {
        this.routes.clear();
        this.withdrawing.clear();
    }

    public unregister<TArgs, TView extends Laya.GWidget>(routeOrId: string | UIViewRoute<TArgs, TView>,
        scenes: Iterable<SceneUI>): Promise<void> {
        const route = this.routes.get(typeof routeOrId === "string" ? routeOrId : routeOrId.id);
        // 旧 World 的清理不能移除复用相同 ID 的新定义。
        if (!route || typeof routeOrId !== "string" && routeOrId !== route) {
            return Promise.resolve();
        }
        const existing = this.unloading.get(route);
        if (existing) {
            return existing;
        }
        this.withdrawing.add(route);
        const task = Promise.allSettled([...scenes].map(scene => scene.unregisterView(route))).then(results => {
            const failures = results.filter(result => result.status === "rejected");
            if (failures.length) {
                throw new LifetimeCleanupError(failures.map(result => result.reason));
            }
            if (this.routes.get(route.id) === route) {
                this.routes.delete(route.id);
            }
            this.withdrawing.delete(route);
        });
        this.unloading.set(route, task);
        task.then(() => this.unloading.delete(route), () => this.unloading.delete(route));
        return task;
    }
}
