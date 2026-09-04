import type {
    ResourceGroupController,
    ResourceLease,
} from "../../application/resource/ResourceGroup";
import {
    BaseGameWindow,
    type WindowLifecycleObserver,
} from "./BaseGameWindow";
import { UILayer } from "./UILayer";

export type UIWindowMultiplicity = "singleton" | "multiple";
export type UIWindowRetention = "hide" | "destroy";
export type UIWindowState = "visible" | "hidden-retained";

export interface UIRoute<TArgs> {
    readonly id: string;
    readonly url: string;
    readonly group: string;
    readonly layer?: UILayer;
    readonly modal?: boolean;
    readonly multiplicity: UIWindowMultiplicity;
    readonly retention: UIWindowRetention;
    create(contentPane: Laya.GWidget): BaseGameWindow<TArgs>;
}

export interface UIWindowInfo {
    readonly routeId: string;
    readonly layer: UILayer;
    readonly modal: boolean;
    readonly state: UIWindowState;
    readonly window: BaseGameWindow<unknown>;
}

export interface UIRouterSnapshot {
    readonly loading: Readonly<Record<string, number>>;
    readonly managed: readonly UIWindowInfo[];
    readonly visible: readonly UIWindowInfo[];
    readonly top?: UIWindowInfo;
    readonly bottom?: UIWindowInfo;
}

interface WindowRecord {
    readonly route: UnknownRoute;
    readonly window: UnknownWindow;
    readonly lease: ResourceLease;
}

type UnknownRoute = UIRoute<unknown>;
type UnknownWindow = BaseGameWindow<unknown>;

export class UIRouter implements WindowLifecycleObserver {
    private readonly routes = new Map<string, UnknownRoute>();
    private readonly singletonWindows = new Map<string, UnknownWindow>();
    private readonly multipleWindows = new Map<string, Set<UnknownWindow>>();
    private readonly records = new Map<UnknownWindow, WindowRecord>();
    private readonly lifecycleVersions = new Map<string, number>();
    private readonly singletonRequestVersions = new Map<string, number>();
    private readonly presentationVersions = new WeakMap<UnknownWindow, number>();
    private readonly pendingLoads = new Set<Promise<unknown>>();
    private readonly loadingCounts = new Map<string, number>();
    private disposed = false;

    constructor(private readonly resources: ResourceGroupController) {}

    register<TArgs>(route: UIRoute<TArgs>): void {
        this.requireActive();
        if (!route.id || !route.url || !route.group) {
            throw new Error("UI route id, url and group are required.");
        }
        if (route.multiplicity === "multiple" && route.retention === "hide") {
            throw new Error(`UI route '${route.id}' cannot combine multiplicity 'multiple' with retention 'hide'.`);
        }
        if (this.routes.has(route.id)) {
            throw new Error(`Duplicate UI route '${route.id}'.`);
        }
        this.routes.set(route.id, route as unknown as UnknownRoute);
        this.lifecycleVersions.set(route.id, 0);
        this.resources.assign(route.url, route.group);
    }

    show<TArgs>(routeId: string, args: TArgs): Promise<BaseGameWindow<TArgs>> {
        this.requireActive();
        const operation = this.showRoute(routeId, args);
        this.pendingLoads.add(operation);
        operation.then(
            () => this.pendingLoads.delete(operation),
            () => this.pendingLoads.delete(operation),
        );
        return operation;
    }

    close(routeId: string, target?: UnknownWindow): void {
        this.requireActive();
        const route = this.requireRoute(routeId);
        if (route.multiplicity === "singleton") {
            if (target && this.singletonWindows.get(routeId) !== target) {
                throw new Error(`UI window does not belong to route '${routeId}'.`);
            }
            this.invalidateRoute(routeId);
            const window = this.singletonWindows.get(routeId);
            if (window) {
                this.closeWindow(route, window);
            }
            return;
        }

        const windows = this.multipleWindows.get(routeId);
        if (target) {
            if (!windows?.has(target)) {
                throw new Error(`UI window does not belong to route '${routeId}'.`);
            }
            this.closeWindow(route, target);
            return;
        }
        this.invalidateRoute(routeId);
        for (const window of Array.from(windows ?? [])) {
            this.closeWindow(route, window);
        }
    }

    closeTop(layer?: UILayer): boolean {
        this.requireActive();
        const info = this.getTop(layer);
        if (!info) {
            return false;
        }
        this.close(info.routeId, info.window);
        return true;
    }

    getTop(layer?: UILayer): UIWindowInfo | undefined {
        const visible = this.listVisible(layer);
        return visible[visible.length - 1];
    }

    getBottom(layer?: UILayer): UIWindowInfo | undefined {
        return this.listVisible(layer)[0];
    }

    listVisible(layer?: UILayer): readonly UIWindowInfo[] {
        return this.listManaged(layer)
            .filter((info) => info.state === "visible")
            .sort(compareVisibleWindows);
    }

    listManaged(layer?: UILayer): readonly UIWindowInfo[] {
        return Array.from(this.records.values())
            .filter((record) => layer === undefined || resolveLayer(record.route) === layer)
            .map(toWindowInfo)
            .sort((left, right) => left.layer - right.layer || compareVisibleWindows(left, right));
    }

    snapshot(): UIRouterSnapshot {
        const visible = this.listVisible();
        return Object.freeze({
            loading: Object.freeze(Object.fromEntries(
                Array.from(this.loadingCounts.entries()).sort(([left], [right]) => left.localeCompare(right)),
            )),
            managed: this.listManaged(),
            visible,
            top: visible[visible.length - 1],
            bottom: visible[0],
        });
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        for (const routeId of this.routes.keys()) {
            this.invalidateRoute(routeId);
        }
        for (const record of Array.from(this.records.values())) {
            this.destroyWindow(record);
        }
        this.routes.clear();
        this.lifecycleVersions.clear();
        this.singletonRequestVersions.clear();
    }

    async waitForPendingLoads(): Promise<void> {
        while (this.pendingLoads.size > 0) {
            await Promise.allSettled(Array.from(this.pendingLoads));
        }
    }

    onHidden(window: UnknownWindow): void {
        const record = this.records.get(window);
        if (record?.route.retention === "destroy") {
            this.destroyWindow(record);
        }
    }

    onDestroyed(window: UnknownWindow): void {
        const record = this.records.get(window);
        if (record) {
            this.untrackWindow(record);
        }
    }

    private async showRoute<TArgs>(routeId: string, args: TArgs): Promise<BaseGameWindow<TArgs>> {
        const route = this.requireRoute(routeId) as UIRoute<TArgs>;
        if (route.multiplicity === "singleton") {
            const cached = this.singletonWindows.get(routeId) as BaseGameWindow<TArgs> | undefined;
            if (cached?.destroyed) {
                this.onDestroyed(cached as unknown as UnknownWindow);
            } else if (cached) {
                return this.presentWindow(route, cached, args);
            }
        }

        const lifecycleVersion = this.lifecycleVersions.get(routeId) ?? 0;
        const requestVersion = route.multiplicity === "singleton"
            ? (this.singletonRequestVersions.get(routeId) ?? 0) + 1
            : 0;
        if (route.multiplicity === "singleton") {
            this.singletonRequestVersions.set(routeId, requestVersion);
        }

        const lease = this.resources.acquire(route.group);
        this.changeLoading(routeId, 1);
        try {
            const prefab = await this.loadPrefab(route);
            if (!prefab) {
                throw new Error(`UI asset '${route.url}' did not load as a Prefab.`);
            }
            const content = prefab.create();
            if (!(content instanceof Laya.GWidget)) {
                content.destroy();
                throw new Error(`UI asset '${route.url}' root must be a GWidget.`);
            }
            if (this.requestExpired(route, lifecycleVersion, requestVersion)) {
                content.destroy();
                throw new Error(`UI request '${routeId}' was superseded.`);
            }

            let window: BaseGameWindow<TArgs>;
            try {
                window = route.create(content);
            } catch (error) {
                content.destroy();
                throw error;
            }
            if (window.destroyed) {
                content.destroy();
                throw new Error(`UI route '${routeId}' created a destroyed window.`);
            }
            this.trackWindow(route, window, lease);
            return await this.presentWindow(route, window, args);
        } catch (error) {
            if (!lease.released) {
                lease.release();
                this.resources.releaseGroupIfUnused(route.group);
            }
            throw error;
        } finally {
            this.changeLoading(routeId, -1);
        }
    }

    private async loadPrefab(route: UnknownRoute): Promise<Laya.Prefab | null> {
        return Laya.loader.load(route.url, {
            type: Laya.Loader.HIERARCHY,
            group: route.group,
        }) as Promise<Laya.Prefab | null>;
    }

    private async presentWindow<TArgs>(
        route: UIRoute<TArgs>,
        window: BaseGameWindow<TArgs>,
        args: TArgs,
    ): Promise<BaseGameWindow<TArgs>> {
        const unknownWindow = window as unknown as UnknownWindow;
        const version = (this.presentationVersions.get(unknownWindow) ?? 0) + 1;
        this.presentationVersions.set(unknownWindow, version);
        window.modal = route.modal ?? resolveLayer(route) === UILayer.Popup;
        window.zOrder = resolveLayer(route) * 1000;
        try {
            const shown = await window.present(args);
            if (!shown || window.destroyed || this.disposed
                || this.presentationVersions.get(unknownWindow) !== version) {
                throw new Error(`UI request '${route.id}' was superseded.`);
            }
            return window;
        } catch (error) {
            if (this.presentationVersions.get(unknownWindow) === version) {
                const record = this.records.get(unknownWindow);
                if (record) {
                    this.destroyWindow(record);
                }
            }
            throw error;
        }
    }

    private trackWindow<TArgs>(
        route: UIRoute<TArgs>,
        window: BaseGameWindow<TArgs>,
        lease: ResourceLease,
    ): void {
        const unknownWindow = window as unknown as UnknownWindow;
        unknownWindow.observeLifecycle(this);
        this.records.set(unknownWindow, {
            route: route as unknown as UnknownRoute,
            window: unknownWindow,
            lease,
        });
        if (route.multiplicity === "singleton") {
            this.singletonWindows.set(route.id, unknownWindow);
            return;
        }
        let windows = this.multipleWindows.get(route.id);
        if (!windows) {
            windows = new Set<UnknownWindow>();
            this.multipleWindows.set(route.id, windows);
        }
        windows.add(unknownWindow);
    }

    private closeWindow(route: UnknownRoute, window: UnknownWindow): void {
        if (route.retention === "hide") {
            window.hideForReuse();
            return;
        }
        const record = this.records.get(window);
        if (record) {
            this.destroyWindow(record);
        }
    }

    private destroyWindow(record: WindowRecord): void {
        if (!record.window.destroyed) {
            record.window.destroy();
        }
        if (this.records.has(record.window)) {
            this.untrackWindow(record);
        }
    }

    private untrackWindow(record: WindowRecord): void {
        this.records.delete(record.window);
        if (record.route.multiplicity === "singleton") {
            if (this.singletonWindows.get(record.route.id) === record.window) {
                this.singletonWindows.delete(record.route.id);
            }
        } else {
            const windows = this.multipleWindows.get(record.route.id);
            windows?.delete(record.window);
            if (windows?.size === 0) {
                this.multipleWindows.delete(record.route.id);
            }
        }
        record.lease.release();
        this.resources.releaseGroupIfUnused(record.route.group);
    }

    private requestExpired(route: UnknownRoute, lifecycleVersion: number, requestVersion: number): boolean {
        return this.disposed
            || this.lifecycleVersions.get(route.id) !== lifecycleVersion
            || (route.multiplicity === "singleton"
                && this.singletonRequestVersions.get(route.id) !== requestVersion);
    }

    private invalidateRoute(routeId: string): void {
        this.lifecycleVersions.set(routeId, (this.lifecycleVersions.get(routeId) ?? 0) + 1);
        this.singletonRequestVersions.set(routeId, (this.singletonRequestVersions.get(routeId) ?? 0) + 1);
    }

    private changeLoading(routeId: string, delta: number): void {
        const count = (this.loadingCounts.get(routeId) ?? 0) + delta;
        if (count <= 0) {
            this.loadingCounts.delete(routeId);
        } else {
            this.loadingCounts.set(routeId, count);
        }
    }

    private requireRoute(routeId: string): UnknownRoute {
        const route = this.routes.get(routeId);
        if (!route) {
            throw new Error(`Unknown UI route '${routeId}'.`);
        }
        return route;
    }

    private requireActive(): void {
        if (this.disposed) {
            throw new Error("UIRouter has been disposed.");
        }
    }
}

function resolveLayer(route: UnknownRoute): UILayer {
    return route.layer ?? UILayer.Screen;
}

function toWindowInfo(record: WindowRecord): UIWindowInfo {
    return Object.freeze({
        routeId: record.route.id,
        layer: resolveLayer(record.route),
        modal: record.window.modal,
        state: record.window.isShowing ? "visible" : "hidden-retained",
        window: record.window,
    });
}

function compareVisibleWindows(left: UIWindowInfo, right: UIWindowInfo): number {
    if (left.layer !== right.layer) {
        return left.layer - right.layer;
    }
    const leftIndex = displayIndex(left.window);
    const rightIndex = displayIndex(right.window);
    return leftIndex - rightIndex;
}

function displayIndex(window: UnknownWindow): number {
    return window.parent?.getChildIndex(window) ?? -1;
}
