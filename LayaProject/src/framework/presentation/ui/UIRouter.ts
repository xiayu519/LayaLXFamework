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
import { UILayoutService, type UIWindowLayout } from "./UILayoutService";
import { SceneUI } from "./SceneUI";
import type { UIViewRoute } from "./UIViewRoute";
import type { RedDotStore } from "./RedDotStore";
import {
    compareVisibleWindows,
    resolveLayer,
    resolveWindowLayout,
    toWindowInfo,
} from "./UIWindowRoutePolicy";

export type UIWindowMultiplicity = "singleton" | "multiple";
export type UIWindowRetention = "hide" | "destroy";
export type UIWindowState = "visible" | "hidden-retained" | "cleanup-failed";

export interface UIRoute<TArgs> {
    readonly id: string;
    readonly url: string;
    readonly layer?: UILayer;
    readonly modal?: boolean;
    /** Defaults to true for center-popup; requires modal and a topmost, interactive window. */
    readonly closeOnMaskClick?: boolean;
    /** Defaults to center-popup for Popup routes and fullscreen for every other layer. */
    readonly layout?: UIWindowLayout;
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
    readonly scenes: readonly ReturnType<SceneUI["snapshot"]>[];
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

interface UIRouterOptions {
    readonly redDots?: RedDotStore;
}

export class UIRouter implements WindowLifecycleObserver {
    private readonly routes = new Map<string, UnknownRoute>();
    private readonly viewRoutes = new Map<string, UIViewRoute<unknown>>();
    private readonly scenes = new Set<SceneUI>();
    private readonly singletonWindows = new Map<string, UnknownWindow>();
    private readonly multipleWindows = new Map<string, Set<UnknownWindow>>();
    private readonly records = new Map<UnknownWindow, WindowRecord>();
    private readonly requests = new UIRequestTracker();
    private readonly presentationVersions = new WeakMap<UnknownWindow, number>();
    private readonly pendingLoads = new Set<Promise<unknown>>();
    private readonly nativeLoads = new Set<Promise<unknown>>();
    private readonly pendingHiddenDestructions = new Set<UnknownWindow>();
    private readonly unsubscribeLayout: (() => void) | undefined;
    private disposed = false;
    private mask: Laya.GWidget | undefined;

    constructor(
        private readonly tips?: TipQueue,
        private readonly layoutService?: UILayoutService,
        private readonly options: UIRouterOptions = {},
    ) {
        this.unsubscribeLayout = layoutService?.subscribe(() => this.layoutManagedWindows());
    }

    get redDots(): RedDotStore {
        const store = this.options.redDots;
        if (!store) throw new Error("UI red dots are not configured.");
        return store;
    }

    /** @internal Optional in isolated hosts which do not use badges. */
    get bindingStore(): RedDotStore | undefined { return this.options.redDots; }

    registerView<TArgs, TView extends Laya.GWidget>(route: UIViewRoute<TArgs, TView>): UIViewRoute<TArgs, TView> {
        this.requireActive();
        if (!route.id || !route.url || !route.viewType) throw new Error("UI view id, url and Runtime type are required.");
        if (route.multiplicity === "multiple" && route.retention === "hide") {
            throw new Error(`UI route '${route.id}' cannot combine multiplicity 'multiple' with retention 'hide'.`);
        }
        if (this.routes.has(route.id) || this.viewRoutes.has(route.id)) throw new Error(`Duplicate UI route '${route.id}'.`);
        this.viewRoutes.set(route.id, route as unknown as UIViewRoute<unknown>);
        return route;
    }

    /** @internal BaseGameScene owns the returned scope and destroys it before its native children. */
    createSceneUI(root: Laya.GWidget): SceneUI {
        this.requireActive();
        const scene = new SceneUI(root, this, this.layout, id => this.viewRoutes.get(id), scope => {
            void scope.waitForPendingLoads().then(() => {
                this.scenes.delete(scope);
            });
        });
        this.scenes.add(scene);
        return scene;
    }

    get layout(): UILayoutService {
        if (!this.layoutService) throw new Error("UI layout is not configured.");
        return this.layoutService;
    }

    register<TArgs>(route: UIRoute<TArgs>): UIRoute<TArgs> {
        this.requireActive();
        if (!route.id || !route.url) {
            throw new Error("UI route id and url are required.");
        }
        if (route.multiplicity === "multiple" && route.retention === "hide") {
            throw new Error(`UI route '${route.id}' cannot combine multiplicity 'multiple' with retention 'hide'.`);
        }
        if (this.routes.has(route.id) || this.viewRoutes.has(route.id)) {
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
            scenes: [...this.scenes].map(scene => scene.snapshot()),
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
            this.mask?.off(Laya.Event.CLICK, this, this.onMaskClick);
            this.mask = undefined;
            this.unsubscribeLayout?.();
            Laya.timer.clearAll(this);
            this.pendingHiddenDestructions.clear();
            try {
                this.tips?.dispose();
            } catch (error) {
                errors.push(error);
            }
            this.requests.cancel();
        }
        for (const scene of [...this.scenes]) {
            try { scene.dispose(); } catch (error) { errors.push(error); }
        }
        for (const record of Array.from(this.records.values())) {
            try {
                this.destroyWindow(record);
            } catch (error) {
                errors.push(error);
            }
        }
        this.routes.clear();
        this.viewRoutes.clear();
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
        await Promise.all([...this.scenes].map(scene => scene.waitForPendingLoads()));
    }

    onHidden(window: UnknownWindow): void {
        const record = this.records.get(window);
        if (record?.route.retention === "destroy") {
            this.pendingHiddenDestructions.add(window);
            Laya.timer.callLater(this, this.destroyHiddenWindow, [window]);
        }
        this.syncModalLayer();
    }

    onDestroyed(window: UnknownWindow): void {
        this.pendingHiddenDestructions.delete(window);
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

    onBinding(operation: Promise<void>): void {
        this.pendingLoads.add(operation);
        operation.then(() => this.pendingLoads.delete(operation), () => this.pendingLoads.delete(operation));
    }

    private async showRoute<TArgs>(routeId: string, args: TArgs, request: UIRequest): Promise<BaseGameWindow<TArgs>> {
        const route = this.requireRoute(routeId) as UIRoute<TArgs>;
        if (request.controller.signal.aborted) throw new BindingCancelledError();
        if (route.multiplicity === "singleton") {
            const cached = this.singletonWindows.get(routeId) as BaseGameWindow<TArgs> | undefined;
            if (cached && this.pendingHiddenDestructions.delete(cached as unknown as UnknownWindow)) {
                const record = this.records.get(cached as unknown as UnknownWindow);
                if (record) this.destroyWindow(record);
            }
            if (cached?.isPopupHiding) {
                const record = this.records.get(cached as unknown as UnknownWindow);
                if (route.retention === "destroy") {
                    if (record) this.destroyWindow(record);
                } else {
                    cached.finishPopupHideImmediately();
                }
            }
            if (cached?.destroyed) {
                const record = this.records.get(cached as unknown as UnknownWindow);
                if (record) this.destroyWindow(record);
            } else if (cached && this.records.has(cached as unknown as UnknownWindow)) {
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
        const layout = resolveWindowLayout(route);
        try {
            window.configureBindings(this.bindingStore);
            window.modal = route.modal ?? layout === "center-popup";
            window.zOrder = resolveLayer(route) * 1000;
            window.configurePopupTransition(layout === "center-popup");
            window.configureDestroyWhenHidden(route.retention === "destroy");
            window.updateLayout(() => this.layoutService?.apply(window, layout));
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
        if (route.retention === "hide" || window.isShowing && window.hasPopupTransition) {
            window.hideForReuse();
            return;
        }
        const record = this.records.get(window);
        if (record) {
            this.destroyWindow(record);
        }
    }

    private destroyWindow(record: WindowRecord): void {
        this.pendingHiddenDestructions.delete(record.window);
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

    private destroyHiddenWindow(window: UnknownWindow): void {
        if (!this.pendingHiddenDestructions.delete(window)) return;
        const record = this.records.get(window);
        if (record?.route.retention === "destroy" && !window.isShowing) {
            this.destroyWindow(record);
        }
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
        if (!this.disposed && !this.mask) {
            this.mask = root.modalLayer;
            this.mask.on(Laya.Event.CLICK, this, this.onMaskClick);
        }
    }

    private onMaskClick(event: Laya.Event): void {
        const root = Laya.GRoot.inst;
        const top = Array.from(root.children).reverse().find(child => child instanceof Laya.GWindow);
        const record = top && this.records.get(top as UnknownWindow);
        if (!record || this.disposed || !record.window.modal || !record.window.mouseEnabled
            || record.window.isPopupHiding || !root.modalLayer.parent) return;
        if (!(record.route.closeOnMaskClick ?? resolveWindowLayout(record.route) === "center-popup")) return;
        event.stopPropagation();
        this.close(record.route.id, record.window);
    }

    private layoutManagedWindows(): void {
        if (this.disposed || !this.layoutService) return;
        for (const record of this.records.values()) {
            if (!record.window.destroyed) {
                record.window.updateLayout(() => this.layoutService?.apply(record.window, resolveWindowLayout(record.route)));
            }
        }
    }
}
