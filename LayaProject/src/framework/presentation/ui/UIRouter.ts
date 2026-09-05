import {
    BaseGameWindow,
    type WindowLifecycleObserver,
} from "./BaseGameWindow";
import { UILayer } from "./UILayer";
import { TipQueue, type TipQueueSnapshot } from "./TipQueue";
import { awaitBinding, BindingCancelledError } from "../../application/ui/AsyncBindingGuard";
import { UIRequestTracker, type UIRequest, type UIRequestInfo } from "./UIRequestTracker";
import { syncModalOrder } from "./UIModalOrder";
import { destroyManagedWindow, getWindowCleanupDiagnostic,
    type CleanupWindowRecord, type UIWindowCleanupDiagnostic } from "./UIWindowCleanup";

export type UIWindowMultiplicity = "singleton" | "multiple";
export type UIWindowRetention = "hide" | "destroy";
export type UIWindowState = "visible" | "hidden-retained" | "cleanup-failed";

export interface UIRoute<TArgs> {
    readonly id: string;
    readonly url: string;
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
    readonly pendingRequests: readonly UIRequestInfo[];
    readonly nativeLoads: number;
    readonly cleanupFailures: number;
    readonly managed: readonly UIWindowInfo[];
    readonly visible: readonly UIWindowInfo[];
    readonly top?: UIWindowInfo;
    readonly bottom?: UIWindowInfo;
    readonly tips: TipQueueSnapshot;
}

export interface UIShowOptions {
    /** Cancels the pending show; once shown, close the window through its normal lifecycle. */
    readonly signal?: AbortSignal;
}

export class UIRouterCleanupError extends Error {
    constructor(readonly errors: readonly unknown[]) {
        super(`${errors.length} UI window(s) failed to clean up.`);
        this.name = "UIRouterCleanupError";
    }
}

interface WindowRecord extends CleanupWindowRecord {
    readonly route: UnknownRoute;
    readonly window: UnknownWindow;
}

type UnknownRoute = UIRoute<unknown>;
type UnknownWindow = BaseGameWindow<unknown>;

export class UIRouter implements WindowLifecycleObserver {
    private readonly routes = new Map<string, UnknownRoute>();
    private readonly singletonWindows = new Map<string, UnknownWindow>();
    private readonly multipleWindows = new Map<string, Set<UnknownWindow>>();
    private readonly records = new Map<UnknownWindow, WindowRecord>();
    private readonly requests = new UIRequestTracker();
    private readonly presentationVersions = new WeakMap<UnknownWindow, number>();
    private readonly pendingLoads = new Set<Promise<unknown>>();
    private readonly nativeLoads = new Set<Promise<unknown>>();
    private disposed = false;

    constructor(private readonly tips?: TipQueue) {}

    register<TArgs>(route: UIRoute<TArgs>): UIRoute<TArgs> {
        this.requireActive();
        if (!route.id || !route.url) {
            throw new Error("UI route id and url are required.");
        }
        if (route.multiplicity === "multiple" && route.retention === "hide") {
            throw new Error(`UI route '${route.id}' cannot combine multiplicity 'multiple' with retention 'hide'.`);
        }
        if (this.routes.has(route.id)) {
            throw new Error(`Duplicate UI route '${route.id}'.`);
        }
        this.routes.set(route.id, route as unknown as UnknownRoute);
        return route;
    }

    show<TArgs>(route: UIRoute<TArgs>, args: NoInfer<TArgs>, options?: UIShowOptions): Promise<BaseGameWindow<TArgs>>;
    show<TArgs>(routeId: string, args: TArgs, options?: UIShowOptions): Promise<BaseGameWindow<TArgs>>;
    show<TArgs>(
        routeOrId: string | UIRoute<TArgs>, args: TArgs, options: UIShowOptions = {},
    ): Promise<BaseGameWindow<TArgs>> {
        this.requireActive();
        const routeId = typeof routeOrId === "string" ? routeOrId : routeOrId.id;
        const route = this.requireRoute(routeId);
        if (typeof routeOrId !== "string" && route !== (routeOrId as unknown as UnknownRoute)) {
            throw new Error(`UI route '${routeId}' is not the registered route object.`);
        }
        if (options.signal?.aborted) return Promise.reject(new BindingCancelledError());
        if (route.multiplicity === "singleton") this.requests.cancel(routeId);
        const request = this.requests.begin(routeId, options.signal);
        const operation = this.showRoute(routeId, args, request)
            .finally(() => this.requests.finish(request));
        this.pendingLoads.add(operation);
        operation.then(
            () => this.pendingLoads.delete(operation),
            () => this.pendingLoads.delete(operation),
        );
        return operation;
    }

    tip(message: string): void {
        this.requireActive();
        if (!this.tips) {
            throw new Error("UI tip presentation is not configured.");
        }
        this.tips.show(message);
    }

    close(routeId: string, target?: UnknownWindow): void {
        this.requireActive();
        const route = this.requireRoute(routeId);
        if (route.multiplicity === "singleton") {
            if (target && this.singletonWindows.get(routeId) !== target) {
                throw new Error(`UI window does not belong to route '${routeId}'.`);
            }
            this.requests.cancel(routeId);
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
            this.requests.cancel(routeId, target);
            this.closeWindow(route, target);
            return;
        }
        this.requests.cancel(routeId);
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
        const pendingRequests = this.requests.snapshot();
        const loading: Record<string, number> = {};
        for (const request of pendingRequests) {
            if (request.phase === "loading") loading[request.routeId] = (loading[request.routeId] ?? 0) + 1;
        }
        return Object.freeze({
            loading: Object.freeze(loading),
            pendingRequests,
            nativeLoads: this.nativeLoads.size,
            cleanupFailures: this.cleanupDiagnostics().length,
            managed: this.listManaged(),
            visible,
            top: visible[visible.length - 1],
            bottom: visible[0],
            tips: this.tips?.snapshot() ?? Object.freeze({ queued: 0, active: 0, shown: 0, dropped: 0 }),
        });
    }

    cleanupDiagnostics(): readonly UIWindowCleanupDiagnostic[] {
        return Array.from(this.records.values(), getWindowCleanupDiagnostic)
            .filter((entry): entry is UIWindowCleanupDiagnostic => entry !== undefined);
    }

    dispose(): void {
        const errors: unknown[] = [];
        if (!this.disposed) {
            this.disposed = true;
            try {
                this.tips?.dispose();
            } catch (error) {
                errors.push(error);
            }
            this.requests.cancel();
        }
        for (const record of Array.from(this.records.values())) {
            try {
                this.destroyWindow(record);
            } catch (error) {
                errors.push(error);
            }
        }
        this.routes.clear();
        if (errors.length > 0) {
            throw new UIRouterCleanupError(errors);
        }
        this.syncModalLayer();
    }

    async waitForPendingLoads(): Promise<void> {
        while (this.pendingLoads.size > 0 || this.nativeLoads.size > 0) {
            await Promise.allSettled([...this.pendingLoads, ...this.nativeLoads]);
        }
        await this.tips?.waitForPending();
    }

    onHidden(window: UnknownWindow): void {
        const record = this.records.get(window);
        if (record?.route.retention === "destroy") {
            this.destroyWindow(record);
        }
        this.syncModalLayer();
    }

    onDestroyed(window: UnknownWindow): void {
        const record = this.records.get(window);
        if (record) {
            if (!window.destructionComplete) throw window.destructionFailure
                ?? new Error("Cannot untrack a UI window before destruction completes.");
            this.untrackWindow(record);
        }
    }

    onOrderChanged(): void {
        this.syncModalLayer();
    }

    private async showRoute<TArgs>(routeId: string, args: TArgs, request: UIRequest): Promise<BaseGameWindow<TArgs>> {
        const route = this.requireRoute(routeId) as UIRoute<TArgs>;
        if (request.controller.signal.aborted) throw new BindingCancelledError();
        if (route.multiplicity === "singleton") {
            const cached = this.singletonWindows.get(routeId) as BaseGameWindow<TArgs> | undefined;
            if (cached?.destroyed) {
                const record = this.records.get(cached as unknown as UnknownWindow);
                if (record) this.destroyWindow(record);
            } else if (cached) {
                return this.presentWindow(route, cached, args, request);
            }
        }

        const prefab = await awaitBinding(this.loadPrefab(route), request.controller.signal);
        if (request.controller.signal.aborted || this.disposed) throw new BindingCancelledError();
        if (!prefab) {
            throw new Error(`UI asset '${route.url}' did not load as a Prefab.`);
        }
        const content = prefab.create();
        if (!(content instanceof Laya.GWidget)) {
            content.destroy();
            throw new Error(`UI asset '${route.url}' root must be a GWidget.`);
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
        if (request.controller.signal.aborted || this.disposed) {
            window.destroy();
            throw new BindingCancelledError();
        }
        this.trackWindow(route, window);
        return this.presentWindow(route, window, args, request);
    }

    private loadPrefab(route: UnknownRoute): Promise<Laya.Prefab | null> {
        const operation = Laya.loader.load(route.url, {
            type: Laya.Loader.HIERARCHY,
        }) as Promise<Laya.Prefab | null>;
        this.nativeLoads.add(operation);
        operation.then(
            () => this.nativeLoads.delete(operation),
            () => this.nativeLoads.delete(operation),
        );
        return operation;
    }

    private async presentWindow<TArgs>(
        route: UIRoute<TArgs>,
        window: BaseGameWindow<TArgs>,
        args: TArgs,
        request: UIRequest,
    ): Promise<BaseGameWindow<TArgs>> {
        const unknownWindow = window as unknown as UnknownWindow;
        const version = (this.presentationVersions.get(unknownWindow) ?? 0) + 1;
        this.presentationVersions.set(unknownWindow, version);
        request.phase = "binding";
        request.window = window;
        window.modal = route.modal ?? resolveLayer(route) === UILayer.Popup;
        window.zOrder = resolveLayer(route) * 1000;
        try {
            const shown = await window.present(args, request.controller.signal);
            if (!shown || window.destroyed || this.disposed
                || this.presentationVersions.get(unknownWindow) !== version) {
                throw new BindingCancelledError();
            }
            this.syncModalLayer();
            return window;
        } catch (error) {
            if (this.presentationVersions.get(unknownWindow) === version) {
                const record = this.records.get(unknownWindow);
                if (record) {
                    if (error instanceof BindingCancelledError && !this.disposed) this.closeWindow(route, unknownWindow);
                    else this.destroyWindow(record);
                }
            }
            throw error;
        }
    }

    private trackWindow<TArgs>(
        route: UIRoute<TArgs>,
        window: BaseGameWindow<TArgs>,
    ): void {
        const unknownWindow = window as unknown as UnknownWindow;
        unknownWindow.observeLifecycle(this);
        this.records.set(unknownWindow, {
            route: route as unknown as UnknownRoute,
            window: unknownWindow,
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
        destroyManagedWindow(record);
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
        this.syncModalLayer();
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

    private syncModalLayer(): void {
        const root = Laya.GRoot?.inst;
        if (!root) {
            return;
        }
        syncModalOrder(root);
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
        state: getWindowCleanupDiagnostic(record) ? "cleanup-failed"
            : record.window.isShowing ? "visible" : "hidden-retained",
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
