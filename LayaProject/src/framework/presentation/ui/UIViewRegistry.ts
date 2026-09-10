import type { SceneUI } from "./SceneUI";
import type { UIViewRoute } from "./UIViewRoute";
import { LifetimeCleanupError } from "../../application/lifecycle/LifetimeScope";

type ViewRoute = UIViewRoute<unknown>;

/** Definitions contain resource addresses and optional dependency injection, never prefab instances. */
export class UIViewRegistry {
    private readonly routes = new Map<string, ViewRoute>();
    private readonly withdrawing = new Set<ViewRoute>();
    private readonly unloading = new Map<ViewRoute, Promise<void>>();

    has(id: string): boolean { return this.routes.has(id); }
    get(id: string): ViewRoute | undefined {
        const route = this.routes.get(id);
        return route && !this.withdrawing.has(route) ? route : undefined;
    }
    set<TArgs, TView extends Laya.GWidget>(route: UIViewRoute<TArgs, TView>): void {
        this.routes.set(route.id, route as unknown as ViewRoute);
    }
    clear(): void { this.routes.clear(); this.withdrawing.clear(); }

    unregister<TArgs, TView extends Laya.GWidget>(routeOrId: string | UIViewRoute<TArgs, TView>,
        scenes: Iterable<SceneUI>): Promise<void> {
        const route = this.routes.get(typeof routeOrId === "string" ? routeOrId : routeOrId.id);
        // A stale World cleanup must not remove a newer definition which reuses the same ID.
        if (!route || typeof routeOrId !== "string" && routeOrId !== route) return Promise.resolve();
        const existing = this.unloading.get(route);
        if (existing) return existing;
        this.withdrawing.add(route);
        const task = Promise.allSettled([...scenes].map(scene => scene.unregisterView(route))).then(results => {
            const failures = results.filter(result => result.status === "rejected");
            if (failures.length) throw new LifetimeCleanupError(failures.map(result => result.reason));
            if (this.routes.get(route.id) === route) this.routes.delete(route.id);
            this.withdrawing.delete(route);
        });
        this.unloading.set(route, task);
        task.then(() => this.unloading.delete(route), () => this.unloading.delete(route));
        return task;
    }
}
