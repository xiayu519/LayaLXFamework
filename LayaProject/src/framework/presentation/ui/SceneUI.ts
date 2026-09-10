import { LifetimeCleanupError, LifetimeScope } from "../../application/lifecycle/LifetimeScope";
import { AsyncBindingGuard, awaitBinding, BindingCancelledError } from "../../application/ui/AsyncBindingGuard";
import { UILayer } from "./UILayer";
import type { UIHostRect, UILayoutService, UILayoutSnapshot } from "./UILayoutService";
import { UIRequestTracker, type UIRequest } from "./UIRequestTracker";
import type { UIRouter, UIShowOptions } from "./UIRouter";
import type { UIViewRoute, UIViewSession } from "./UIViewRoute";
import { UIBindings } from "./UIBindings";
import { UIPopupTransition } from "./UIPopupTransition";
import { observeViewLifetime, type UIViewOwner, type UIViewRecord, type UIViewPresentation } from "./UIViewLifetime";

type ViewRoute = UIViewRoute<unknown>;

/** Native scene display host. Layout never determines lifetime ownership. */
export class SceneUI {
    private readonly sceneOwner: UIViewOwner = { requests: new UIRequestTracker(), records: new Set(), open: true };
    private readonly owners = new Set<UIViewOwner>([this.sceneOwner]);
    private readonly records = new Map<Laya.GWidget, UIViewRecord>();
    private readonly pending = new Set<Promise<unknown>>();
    private readonly unsubscribeLayout: () => void;
    private mask: Laya.Sprite | undefined;
    private disposed = false;
    private synchronizing = false;
    private viewport: UIHostRect | undefined;
    private hostLayout: UILayoutSnapshot | undefined;

    constructor(readonly root: Laya.GWidget, private readonly application: UIRouter,
        private readonly layout: UILayoutService, private readonly resolveView: (id: string) => ViewRoute | undefined,
        private readonly onDisposed: (scope: SceneUI) => void) {
        this.unsubscribeLayout = layout.subscribe(() => this.applyLayout());
    }

    get redDots(): UIRouter["redDots"] { return this.application.redDots; }
    /** Shared host mask, created lazily for modal views. */
    get modalLayer(): Laya.Sprite | undefined { return this.mask; }

    /** Stage logical coordinates. The host's ancestors must be untransformed screen-space nodes.
     * Omit the rectangle to follow the entire viewport again. zOrder stays caller-controlled. */
    setViewport(rect?: UIHostRect): void {
        this.requireActive();
        if (rect && (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
            || rect.width <= 0 || rect.height <= 0)) throw new Error("UI viewport must have finite coordinates and positive dimensions.");
        this.viewport = rect && Object.freeze({ ...rect });
        this.applyLayout();
    }

    /** Destroy hidden retained views at a feature boundary before calling native Scene.gc(). */
    releaseCached(routeId?: string): void {
        this.requireActive();
        const errors: unknown[] = [];
        for (const record of [...this.records.values()]) {
            if (record.route.retention === "hide" && !record.shown && !record.presentation
                && (!routeId || record.route.id === routeId)) attempt(errors, () => this.destroyView(record));
        }
        if (errors.length) throw new LifetimeCleanupError(errors);
    }

    show<TArgs, TView extends Laya.GWidget>(route: UIViewRoute<TArgs, TView>, args: NoInfer<TArgs>, options?: UIShowOptions): Promise<TView>;
    show<TArgs>(route: string, args: TArgs, options?: UIShowOptions): Promise<Laya.GWidget>;
    show<TArgs>(route: string | UIViewRoute<TArgs>, args: TArgs, options: UIShowOptions = {}): Promise<Laya.GWidget> {
        this.requireActive();
        return this.showOwned(this.sceneOwner, route, args, options);
    }

    close(routeId: string, target?: Laya.GWidget): void {
        if (this.disposed) return;
        this.requireActive();
        if (target) {
            const record = this.records.get(target);
            if (!record || record.route.id !== routeId) throw new Error(`UI view does not belong to route '${routeId}'.`);
            record.owner.requests.cancel(routeId, target);
            this.closeRecord(record);
        } else {
            // Route IDs address scene-owned instances; nested instances use their session or exact view.
            this.sceneOwner.requests.cancel(routeId);
            const errors: unknown[] = [];
            for (const record of [...this.sceneOwner.records]) {
                if (record.route.id === routeId) attempt(errors, () => this.closeRecord(record));
            }
            if (errors.length) throw new LifetimeCleanupError(errors);
        }
    }

    closeTop(): boolean {
        this.requireActive();
        const top = last(this.visibleRecords());
        if (!top) return false;
        this.closeRecord(top);
        return true;
    }

    tip(message: string): void { this.requireActive(); this.application.tip(message); }

    snapshot() {
        return Object.freeze({ disposed: this.disposed,
            pendingRequests: [...this.owners].flatMap(owner => owner.requests.snapshot()),
            views: this.orderedRecords().map(record => ({ routeId: record.route.id, view: record.view,
                owner: record.owner.parent?.view ?? this.root, visible: this.isVisible(record), closing: record.closing,
                cleanupFailed: record.cleanupFailure !== undefined })),
        });
    }

    dispose(): void {
        if (!this.disposed) {
            this.disposed = true;
            this.sceneOwner.open = false;
            for (const owner of this.owners) owner.requests.cancel();
            this.unsubscribeLayout();
            this.mask?.off(Laya.Event.CLICK, this, this.onMaskClick);
        }
        const errors: unknown[] = [];
        for (const record of [...this.records.values()]) attempt(errors, () => this.destroyView(record));
        attempt(errors, () => { this.mask?.destroy(); this.mask = undefined; });
        if (errors.length) throw new LifetimeCleanupError(errors);
        this.owners.clear();
        this.onDisposed(this);
    }

    async waitForPendingLoads(): Promise<void> {
        while (this.pending.size) await Promise.allSettled([...this.pending]);
    }

    private showOwned<TArgs>(owner: UIViewOwner, route: string | UIViewRoute<TArgs>, args: TArgs,
        options: UIShowOptions = {}): Promise<Laya.GWidget> {
        if (!ownerAlive(owner) || this.disposed || this.root.destroyed || options.signal?.aborted) return Promise.reject(new BindingCancelledError());
        const id = typeof route === "string" ? route : route.id;
        const registered = this.resolveView(id);
        if (!registered) throw new Error(`Unknown native UI route '${id}'; register scene UI with registerView().`);
        if (typeof route !== "string" && route !== registered) throw new Error(`UI route '${id}' is not registered.`);
        if (registered.multiplicity !== "multiple") owner.requests.cancel(id);
        const request = owner.requests.begin(id, options.signal);
        return this.track(this.showView(owner, registered, args, request).finally(() => owner.requests.finish(request)));
    }

    private async showView(owner: UIViewOwner, route: ViewRoute, args: unknown, request: UIRequest): Promise<Laya.GWidget> {
        const signal = request.controller.signal;
        let record = route.multiplicity === "multiple" ? undefined : [...owner.records].find(item => item.route.id === route.id);
        if (record?.cleanupFailure) throw record.cleanupFailure;
        if (record?.closing) this.finishClose(record);
        if (record?.view.destroyed) { this.destroyView(record); record = undefined; }
        if (!record) {
            const loading = this.track(Laya.loader.load(route.url, { type: Laya.Loader.HIERARCHY }) as Promise<Laya.Prefab | null>);
            const prefab = await awaitBinding(loading, signal);
            if (signal.aborted || !ownerAlive(owner) || this.disposed || this.root.destroyed) throw new BindingCancelledError();
            if (!(prefab instanceof Laya.Prefab)) throw new Error(`UI asset '${route.url}' is not a Prefab.`);
            const errors: unknown[] = [];
            const view = prefab.create(undefined, errors);
            if (errors.length || !(view instanceof route.viewType) || !(view instanceof Laya.GWidget)) {
                view?.destroy();
                throw new Error(`UI asset '${route.url}' must use Runtime ${route.viewType.name}; ${errors.join(", ")}`);
            }
            record = { route, view, owner, guard: new AsyncBindingGuard(), shown: false, closing: false, destroying: false,
                transition: route.layout === "center-popup" ? new UIPopupTransition(view) : undefined };
            this.records.set(view, record);
            owner.records.add(record);
            const tracked = record;
            observeViewLifetime(view, () => tracked.presentation?.bindings, () => this.destroyView(tracked), error => {
                tracked.lifetimeFailure = tracked.cleanupFailure = error;
            });
        }
        request.window = record.view;
        request.phase = "binding";
        this.endPresentation(record);
        const bindings = new UIBindings(record.view, this.application.bindingStore);
        const guarded = record.guard.next(signal);
        const view = record.view;
        const isCurrent = (): boolean => guarded.isCurrent() && ownerAlive(owner) && !view.destroyed && !this.root.destroyed;
        const presentation: UIViewPresentation = { requests: new UIRequestTracker(), records: new Set(), parent: record, open: true,
            lifetime: new LifetimeScope(), bindings, token: { ...guarded, isCurrent,
                commit(action): boolean { if (!isCurrent()) return false; action(); return true; } } };
        record.presentation = presentation;
        record.args = args;
        record.closing = false;
        this.owners.add(presentation);
        const { token, lifetime } = presentation;
        const target = record;
        const session: UIViewSession = {
            ui: this, token, lifetime, bindData: bindings.bindData.bind(bindings), bindRedDot: bindings.bindRedDot.bind(bindings),
            show: ((child: string | UIViewRoute<unknown>, childArgs: unknown, options?: UIShowOptions) =>
                this.showOwned(presentation, child, childArgs, options)) as UIViewSession["show"],
            close: () => { if (token.isCurrent()) this.closeRecord(target); },
        };
        try {
            record.transition?.cancel();
            record.view.mouseEnabled = true;
            record.view.mouseThrough = route.layout === "center-popup";
            record.view.zOrder = layerOf(route) * 1000;
            this.layout.applyView(record.view, route.layout ?? "fullscreen", false, this.hostLayout);
            const binding = this.track(Promise.resolve(route.bind(record.view, args, session)));
            await awaitBinding(binding, token.signal);
            if (!token.isCurrent() || this.disposed) throw new BindingCancelledError();
            this.root.addChild(record.view);
            this.root.setChildIndex(record.view, this.root.numChildren - 1);
            record.shown = true;
            this.synchronize();
            record.transition?.show();
            return record.view;
        } catch (error) {
            if (record.presentation === presentation) this.destroyView(record);
            if (signal.aborted) throw new BindingCancelledError();
            throw error;
        }
    }

    private closeRecord(record: UIViewRecord): void {
        if (record.closing && record.cleanupFailure && !record.view.destroyed) { this.destroyView(record); return; }
        if (record.closing || record.destroying || record.view.destroyed) return;
        record.closing = true;
        const errors: unknown[] = [];
        attempt(errors, () => this.endPresentation(record));
        attempt(errors, () => {
            if (!errors.length && record.shown && record.view.parent && record.transition) {
                record.transition.hide(() => this.finishClose(record));
            } else this.finishClose(record);
        });
        if (errors.length) throw new LifetimeCleanupError(errors);
    }

    private finishClose(record: UIViewRecord): void {
        record.transition?.cancel();
        if (record.route.retention === "hide" && record.owner.open && !this.disposed) {
            record.view.removeSelf();
            record.closing = false;
            this.notifyClosed(record);
            this.synchronize();
        } else this.destroyView(record);
    }

    private endPresentation(record: UIViewRecord): void {
        record.guard.invalidate();
        const presentation = record.presentation;
        record.presentation = undefined;
        if (!presentation) return;
        presentation.open = false;
        presentation.requests.cancel();
        const errors: unknown[] = [];
        attempt(errors, () => presentation.bindings.dispose());
        for (const child of [...presentation.records]) attempt(errors, () => this.destroyView(child));
        attempt(errors, () => presentation.lifetime.dispose());
        this.owners.delete(presentation);
        if (errors.length) {
            record.lifetimeFailure = record.cleanupFailure = new LifetimeCleanupError(errors);
            throw record.cleanupFailure;
        }
    }

    private destroyView(record: UIViewRecord): void {
        if (record.destroying || !this.records.has(record.view)) return;
        record.destroying = true;
        const previous = record.lifetimeFailure ?? (record.view.destroyed ? record.cleanupFailure : undefined);
        const errors: unknown[] = previous ? [previous] : [];
        attempt(errors, () => this.endPresentation(record));
        record.guard.dispose();
        attempt(errors, () => record.transition?.cancel());
        attempt(errors, () => {
            if (!record.view.destroyed) record.view.destroy();
            if (!record.view.destroyed) throw new Error("Native UI destruction did not complete.");
        });
        record.destroying = false;
        if (errors.length) {
            attempt(errors, () => this.synchronize());
            record.cleanupFailure = new LifetimeCleanupError(errors);
            throw record.cleanupFailure;
        }
        this.records.delete(record.view);
        record.owner.records.delete(record);
        this.notifyClosed(record);
        this.synchronize();
    }

    private notifyClosed(record: UIViewRecord): void {
        if (!record.shown) return;
        record.shown = false;
        const args = record.args;
        void Promise.resolve().then(() => {
            try { record.route.onClosed?.(record.view, args); }
            catch (error) { console.error("[UI] onClosed failed after view cleanup", error); }
        });
    }

    private synchronize(): void {
        if (this.disposed || this.synchronizing) return;
        this.synchronizing = true;
        try {
            const records = this.orderedRecords().filter(record => record.view.parent === this.root && !record.view.destroyed);
            const topPage = last(records.filter(record => isPage(record.route)));
            const active = (record: UIViewRecord): boolean => isPage(record.route) ? record === topPage
                : !record.owner.parent || active(record.owner.parent);
            for (const record of records) {
                const enabled = active(record);
                record.view.active = enabled;
                record.presentation?.bindings.setActive(enabled && record.view.activeInHierarchy);
            }
            const modal = last(records.filter(record => record.view.active && record.view.visible && isModal(record.route)));
            if (!modal) { this.mask?.removeSelf(); return; }
            if (!this.mask) {
                this.mask = new Laya.Sprite();
                this.mask.name = "uiModalMask";
                this.mask.mouseEnabled = true;
                this.mask.graphics.drawRect(0, 0, 1, 1, Laya.UIConfig2.modalLayerColor, null, 0, true);
                this.mask.on(Laya.Event.CLICK, this, this.onMaskClick);
            }
            this.mask.pos(0, 0).size(this.root.width, this.root.height);
            this.mask.zOrder = modal.view.zOrder;
            if (!this.mask.parent) this.root.addChildAt(this.mask, this.root.getChildIndex(modal.view));
            else this.root.setChildIndexBefore(this.mask, this.root.getChildIndex(modal.view));
        } finally { this.synchronizing = false; }
    }

    private onMaskClick(event: Laya.Event): void {
        event.stopPropagation();
        const top = last(this.visibleRecords());
        if (this.disposed || !top || top.closing || !top.view.mouseEnabled || !isModal(top.route)
            || !(top.route.closeOnMaskClick ?? top.route.layout === "center-popup")) return;
        this.closeRecord(top);
    }

    private orderedRecords(): UIViewRecord[] {
        return [...this.records.values()].sort((a, b) => a.view.zOrder - b.view.zOrder
            || this.root.getChildIndex(a.view) - this.root.getChildIndex(b.view));
    }
    private isVisible(record: UIViewRecord): boolean {
        return record.view.parent === this.root && record.view.active && record.view.visible && !record.view.destroyed;
    }
    private visibleRecords(): UIViewRecord[] { return this.orderedRecords().filter(record => this.isVisible(record)); }

    private applyLayout(): void {
        if (this.disposed || this.root.destroyed) return;
        const rect = this.viewport ?? this.layout.snapshot().viewport;
        const { width, height } = rect;
        this.root.pos(rect.x, rect.y).size(width, height);
        this.hostLayout = this.viewport ? this.layout.snapshotForHost(rect) : undefined;
        for (const record of this.records.values()) {
            if (record.view.destroyed) continue;
            const apply = (): void => this.layout.applyView(record.view, record.route.layout ?? "fullscreen", false, this.hostLayout);
            if (record.transition) record.transition.relayout(apply);
            else apply();
        }
        this.mask?.size(width, height);
    }
    private track<T>(operation: Promise<T>): Promise<T> {
        this.pending.add(operation);
        operation.then(() => this.pending.delete(operation), () => this.pending.delete(operation));
        return operation;
    }
    private requireActive(): void {
        if (this.disposed || this.root.destroyed) throw new Error("Scene UI has been disposed.");
    }
}

function layerOf(route: ViewRoute): UILayer { return route.layer ?? (route.layout === "center-popup" ? UILayer.Popup : UILayer.Screen); }
function isPage(route: ViewRoute): boolean { return (route.navigation ?? (layerOf(route) === UILayer.Screen ? "page" : "overlay")) === "page"; }
function isModal(route: ViewRoute): boolean { return route.modal ?? route.layout === "center-popup"; }
function attempt(errors: unknown[], action: () => void): void { try { action(); } catch (error) { errors.push(error); } }
function last<T>(items: readonly T[]): T | undefined { return items[items.length - 1]; }
function ownerAlive(owner: UIViewOwner): boolean {
    return owner.open && (!owner.parent || !owner.parent.view.destroyed && ownerAlive(owner.parent.owner));
}
