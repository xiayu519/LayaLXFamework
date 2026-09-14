import { logger } from "../../application/diagnostics/Logger";
import { LifetimeCleanupError, LifetimeScope } from "../../application/lifecycle/LifetimeScope";
import { AsyncBindingGuard, awaitBinding, BindingCancelledError } from "../../application/ui/AsyncBindingGuard";
import type { UIHostRect, UILayoutService, UILayoutSnapshot } from "./UILayoutService";
import { UIRequestTracker, type UIRequest } from "./UIRequestTracker";
import type { UIRouter, UIShowOptions } from "./UIRouter";
import type { UIViewRoute, UIViewSession } from "./UIViewRoute";
import { UIBindings } from "./UIBindings";
import { UIPopupTransition } from "./UIPopupTransition";
import type { UIViewOwner, UIViewRecord, UIViewPresentation } from "./UIViewLifetime";
import { UIViewLifecycle, type UIViewSettings } from "./UIViewLifecycle";
import { applyLayerOrder, syncDisplayOrder } from "./UILayerOrder";
import { UILayer } from "./UILayer";

type ViewRoute = UIViewRoute<unknown>;

/** 原生场景的显示宿主；布局不决定生命周期归属。 */
export class SceneUI {
    private readonly sceneOwner: UIViewOwner = { requests: new UIRequestTracker(), pending: new Set(), records: new Set(), open: true };
    private readonly owners = new Set<UIViewOwner>([this.sceneOwner]);
    private readonly records = new Map<Laya.GWidget, UIViewRecord>();
    private readonly pending = new Map<Promise<unknown>, { route: ViewRoute; owner: UIViewOwner }>();
    private readonly settings = new WeakMap<ViewRoute, UIViewSettings>();
    private readonly unsubscribeLayout: () => void;
    private mask: Laya.Sprite | undefined;
    private disposed = false;
    private synchronizing = false;
    private viewport: UIHostRect | undefined;
    private hostLayout: UILayoutSnapshot | undefined;
    private sequence = 0;
    private readonly replacements = new Map<UILayer, number>();
    private changingPages = false;

    public constructor(public readonly root: Laya.GWidget, private readonly application: UIRouter,
        private readonly layout: UILayoutService, private readonly resolveView: (id: string) => ViewRoute | undefined,
        private readonly onDisposed: (scope: SceneUI) => void) {
        this.unsubscribeLayout = layout.subscribe(() => this.applyLayout());
    }

    public get redDots(): UIRouter["redDots"] {
        return this.application.redDots;
    }

    /** 宿主共用的遮罩，在需要模态界面时才创建。 */
    public get modalLayer(): Laya.Sprite | undefined {
        return this.mask;
    }

    /**
     * 使用舞台逻辑坐标；宿主祖先必须是未施加变换的屏幕空间节点。
     * 省略矩形可恢复跟随整个视口；zOrder 仍由调用方控制。
     */
    public setViewport(rect?: UIHostRect): void {
        this.requireActive();
        if (rect && (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
            || rect.width <= 0 || rect.height <= 0)) {
            throw new Error("UI viewport must have finite coordinates and positive dimensions.");
        }
        this.viewport = rect && Object.freeze({ ...rect });
        this.applyLayout();
    }

    /** 功能结束时先销毁隐藏保留的界面，再调用原生 Scene.gc()。 */
    public releaseCached(routeId?: string): void {
        this.requireActive();
        const errors: unknown[] = [];
        for (const record of [...this.records.values()]) {
            if (record.settings.retention === "hide" && !record.shown && !record.presentation
                && (!routeId || record.route.id === routeId)) {
                attempt(errors, () => this.destroyView(record));
            }
        }
        if (errors.length) {
            throw new LifetimeCleanupError(errors);
        }
    }

    public show<TArgs, TView extends Laya.GWidget>(route: UIViewRoute<TArgs, TView>, args: NoInfer<TArgs>, options?: UIShowOptions): Promise<TView>;

    public show<TArgs>(route: string, args: TArgs, options?: UIShowOptions): Promise<Laya.GWidget>;

    public show<TArgs>(route: string | UIViewRoute<TArgs>, args: TArgs, options: UIShowOptions = {}): Promise<Laya.GWidget> {
        this.requireActive();
        return this.showOwned(this.sceneOwner, route, args, options);
    }

    public close(routeId: string, target?: Laya.GWidget): void {
        if (this.disposed) {
            return;
        }
        this.requireActive();
        if (target) {
            const record = this.records.get(target);
            if (!record || record.route.id !== routeId) {
                throw new Error(`UI view does not belong to route '${routeId}'.`);
            }
            record.owner.requests.cancel(routeId, target);
            this.closeRecord(record);
        } else {
            // 路由 ID 定位场景持有的实例；嵌套实例通过其会话或具体界面对象定位。
            this.sceneOwner.requests.cancel(routeId);
            const errors: unknown[] = [];
            for (const record of [...this.sceneOwner.records]) {
                if (record.route.id === routeId) {
                    attempt(errors, () => this.closeRecord(record));
                }
            }
            if (errors.length) {
                throw new LifetimeCleanupError(errors);
            }
        }
    }

    public closeTop(): boolean {
        this.requireActive();
        const top = last(this.visibleRecords());
        if (!top) {
            return false;
        }
        this.closeRecord(top);
        return true;
    }

    /** 在配置的层内提升已显示窗口的顺序，不重新绑定或变更父节点。 */
    public bringToFront(view: Laya.GWidget): void {
        this.requireActive();
        const record = this.records.get(view);
        if (!record || !this.isVisible(record) || record.closing) {
            throw new Error("UI view is not an open window of this scene.");
        }
        record.order = ++this.sequence;
        this.synchronize();
    }

    public tip(message: string): void {
        this.requireActive();
        this.application.tip(message);
    }

    public snapshot() {
        return Object.freeze({
            disposed: this.disposed,
            pendingRequests: [...this.owners].flatMap(owner => owner.requests.snapshot()),
            views: this.orderedRecords().map(record => ({
                routeId: record.route.id, view: record.view,
                owner: record.owner.parent?.view ?? this.root, visible: this.isVisible(record), closing: record.closing,
                cleanupFailed: record.cleanupFailure !== undefined
            })),
        });
    }

    public dispose(): void {
        if (!this.disposed) {
            this.disposed = true;
            this.sceneOwner.open = false;
            for (const owner of this.owners) {
                owner.requests.cancel();
            }
            this.unsubscribeLayout();
            this.mask?.off(Laya.Event.CLICK, this, this.onMaskClick);
        }
        const errors: unknown[] = [];
        for (const record of [...this.records.values()]) {
            attempt(errors, () => this.destroyView(record));
        }
        attempt(errors, () => {
            this.mask?.destroy();
            this.mask = undefined;
        });
        if (errors.length) {
            throw new LifetimeCleanupError(errors);
        }
        this.owners.clear();
        this.onDisposed(this);
    }

    public async waitForPendingLoads(): Promise<void> {
        while (this.pending.size) {
            await Promise.allSettled([...this.pending.keys()]);
        }
    }

    /** @internal 路由器先封锁注册项，再执行该路由的清理。 */
    public async unregisterView(route: ViewRoute): Promise<void> {
        const errors: unknown[] = [];
        for (const owner of this.owners) {
            owner.requests.cancel(route.id);
        }
        for (const record of [...this.records.values()]) {
            if (record.route === route) {
                attempt(errors, () => this.destroyView(record));
            }
        }
        for (; ;) {
            const tasks = [...this.pending].filter(([, task]) => task.route === route || ownedByRoute(task.owner, route));
            if (!tasks.length) {
                break;
            }
            await Promise.allSettled(tasks.map(([operation]) => operation));
        }
        this.settings.delete(route);
        if (errors.length) {
            throw new LifetimeCleanupError(errors);
        }
    }

    private showOwned<TArgs>(owner: UIViewOwner, route: string | UIViewRoute<TArgs>, args: TArgs,
        options: UIShowOptions = {}): Promise<Laya.GWidget> {
        if (!ownerAlive(owner) || this.disposed || this.root.destroyed || options.signal?.aborted) {
            return Promise.reject(new BindingCancelledError());
        }
        const id = typeof route === "string" ? route : route.id;
        const registered = this.resolveView(id);
        if (!registered) {
            throw new Error(`Unknown native UI route '${id}'; register scene UI with registerView().`);
        }
        if (typeof route !== "string" && route !== registered) {
            throw new Error(`UI route '${id}' is not registered.`);
        }
        // 首次加载尚未读到资源配置的多实例策略，不能取消其他并发请求。
        if (this.settings.get(registered)?.multiplicity === "singleton") {
            owner.requests.cancel(id);
        }
        const request = owner.requests.begin(id, options.signal);
        const order = ++this.sequence;
        owner.pending.add(request);
        let start!: () => void;
        const operation = new Promise<Laya.GWidget>((resolve, reject) => {
            start = () => {
                void this.showView(owner, registered, args, request, order).then(resolve, reject);
            };
        }).finally(() => {
            owner.pending.delete(request);
            owner.requests.finish(request);
            if (![...owner.pending].some(other => other.routeId === id && !other.controller.signal.aborted)) {
                for (const record of [...owner.records]) {
                    if (record.route === registered && record.initializing) {
                        this.destroyView(record);
                    }
                }
            }
        });
        // 缓存界面的 onBind 可能同步关闭自身 World，因此先登记外层任务。
        const tracked = this.track(registered, owner, operation);
        start();
        return tracked;
    }

    private async showView(owner: UIViewOwner, route: ViewRoute, args: unknown, request: UIRequest, order: number): Promise<Laya.GWidget> {
        const signal = request.controller.signal;
        let record = this.settings.get(route)?.multiplicity === "multiple" ? undefined
            : [...owner.records].find(item => item.route === route);
        if (record?.cleanupFailure) {
            throw record.cleanupFailure;
        }
        if (record?.closing) {
            this.finishClose(record);
        }
        if (record?.view.destroyed) {
            this.destroyView(record);
            record = undefined;
        }
        if (!record) {
            // 原生 Loader 合并资源请求；各调用方仍独立负责取消和等待清理。
            const loading = this.track(route, owner,
                Laya.loader.load(route.url, { type: Laya.Loader.HIERARCHY }) as Promise<Laya.Prefab | null>);
            const prefab = await awaitBinding(loading, signal);
            if (signal.aborted || !ownerAlive(owner) || this.disposed || this.root.destroyed) {
                throw new BindingCancelledError();
            }
            if (!(prefab instanceof Laya.Prefab)) {
                throw new Error(`UI asset '${route.url}' is not a Prefab.`);
            }
            // 等待 Loader 时，另一个首次加载请求可能已创建单例。
            record = this.settings.get(route)?.multiplicity === "singleton"
                ? [...owner.records].find(item => item.route === route) : undefined;
            record ??= this.createView(owner, route, prefab);
        }
        if (signal.aborted || !ownerAlive(owner) || this.disposed || this.root.destroyed) {
            this.destroyView(record);
            throw new BindingCancelledError();
        }
        if (record.settings.multiplicity === "singleton") {
            const newer = [...owner.pending].some(other => other.routeId === route.id && other.id > request.id
                && !other.controller.signal.aborted);
            if (newer) {
                request.controller.abort();
                throw new BindingCancelledError();
            }
            for (const other of owner.pending) {
                if (other.routeId === route.id && other.id < request.id) {
                    other.controller.abort();
                }
            }
        }
        request.window = record.view;
        request.phase = "binding";
        record.initializing = false;
        this.endPresentation(record);
        const bindings = new UIBindings(record.view, this.application.bindingStore);
        const guarded = record.guard.next(signal);
        const view = record.view;
        const isCurrent = (): boolean => guarded.isCurrent() && ownerAlive(owner) && !view.destroyed && !this.root.destroyed;
        const presentation: UIViewPresentation = {
            requests: new UIRequestTracker(), pending: new Set(), records: new Set(), parent: record, open: true,
            lifetime: new LifetimeScope(), bindings, token: {
                ...guarded, isCurrent,
                commit(action): boolean {
                    if (!isCurrent()) {
                        return false;
                    }
                    action();
                    return true;
                }
            }
        };
        record.presentation = presentation;
        record.order = order;
        record.args = args;
        record.closing = false;
        this.owners.add(presentation);
        const { token, lifetime } = presentation;
        const target = record;
        const session: UIViewSession = {
            ui: this, token, lifetime, bindData: bindings.bindData.bind(bindings), bindRedDot: bindings.bindRedDot.bind(bindings),
            show: ((child: string | UIViewRoute<unknown>, childArgs: unknown, options?: UIShowOptions) =>
                this.showOwned(presentation, child, childArgs, options)) as UIViewSession["show"],
            close: () => {
                if (token.isCurrent()) {
                    this.closeRecord(target);
                }
            },
        };
        try {
            record.transition?.cancel();
            record.view.mouseEnabled = true;
            record.view.mouseThrough = record.settings.layout === "center-popup";
            this.requireCurrentPage(record, order);
            this.layout.applyView(record.view, record.settings.layout, false, this.hostLayout);
            const binding = this.track(route, owner, Promise.resolve(route.bind
                ? route.bind(record.view, args, session) : bindRuntime(record.view, args, session)));
            await awaitBinding(binding, token.signal);
            if (!token.isCurrent() || this.disposed) {
                throw new BindingCancelledError();
            }
            this.requireCurrentPage(record, order);
            record.order = order;
            this.root.addChild(record.view);
            this.synchronize();
            // UIShowOptions.signal 只取消加载；关闭来源页面不能连带取消后继页面。
            request.unlink();
            record.shown = true;
            this.replaceLowerPages(record);
            record.transition?.show();
            return record.view;
        } catch (error) {
            if (record.presentation === presentation) {
                this.destroyView(record);
            }
            if (signal.aborted) {
                throw new BindingCancelledError();
            }
            throw error;
        }
    }

    private createView(owner: UIViewOwner, route: ViewRoute, prefab: Laya.Prefab): UIViewRecord {
        const errors: unknown[] = [];
        const view = prefab.create(undefined, errors);
        try {
            if (errors.length || !(view instanceof Laya.GWidget)) {
                throw new Error(`UI asset '${route.url}' must have a GWidget Runtime root; ${errors.join(", ")}`);
            }
            const observer = view.getComponent(UIViewLifecycle);
            if (!observer || !observer.enabled) {
                throw new Error(`UI asset '${route.url}' requires an enabled UIViewLifecycle component on its prefab root.`);
            }
            if (!route.bind && !("onBind" in view && typeof view.onBind === "function")) {
                throw new Error(`UI asset '${route.url}' Runtime must implement onBind(args, session).`);
            }
            const settings = observer.settings();
            const record: UIViewRecord = {
                route, settings, view, owner, guard: new AsyncBindingGuard(), shown: false, initializing: true,
                closing: false, destroying: false, order: 0,
                transition: settings.layout === "center-popup" ? new UIPopupTransition(view) : undefined
            };
            observer.observe(() => record.presentation?.bindings, () => this.destroyView(record), error => {
                record.lifetimeFailure = record.cleanupFailure = error;
            });
            this.settings.set(route, settings);
            this.records.set(view, record);
            owner.records.add(record);
            return record;
        } catch (error) {
            view?.destroy();
            throw error;
        }
    }

    private closeRecord(record: UIViewRecord): void {
        if (record.closing && record.cleanupFailure && !record.view.destroyed) {
            this.destroyView(record);
            return;
        }
        if (record.closing || record.destroying || record.view.destroyed) {
            return;
        }
        record.closing = true;
        const errors: unknown[] = [];
        attempt(errors, () => this.endPresentation(record));
        attempt(errors, () => {
            if (!errors.length && record.shown && record.view.parent && record.transition) {
                record.transition.hide(() => this.finishClose(record));
            } else {
                this.finishClose(record);
            }
        });
        if (errors.length) {
            throw new LifetimeCleanupError(errors);
        }
    }

    private finishClose(record: UIViewRecord): void {
        record.transition?.cancel();
        if (record.settings.retention === "hide" && record.owner.open && !this.disposed) {
            record.view.removeSelf();
            record.closing = false;
            this.notifyClosed(record);
            this.synchronize();
        } else {
            this.destroyView(record);
        }
    }

    private endPresentation(record: UIViewRecord): void {
        record.guard.invalidate();
        const presentation = record.presentation;
        record.presentation = undefined;
        if (!presentation) {
            return;
        }
        presentation.open = false;
        presentation.requests.cancel();
        const errors: unknown[] = [];
        attempt(errors, () => presentation.bindings.dispose());
        for (const child of [...presentation.records]) {
            attempt(errors, () => this.destroyView(child));
        }
        attempt(errors, () => presentation.lifetime.dispose());
        this.owners.delete(presentation);
        if (errors.length) {
            record.lifetimeFailure = record.cleanupFailure = new LifetimeCleanupError(errors);
            throw record.cleanupFailure;
        }
    }

    private destroyView(record: UIViewRecord): void {
        if (record.destroying || !this.records.has(record.view)) {
            return;
        }
        record.destroying = true;
        const previous = record.lifetimeFailure ?? (record.view.destroyed ? record.cleanupFailure : undefined);
        const errors: unknown[] = previous ? [previous] : [];
        attempt(errors, () => this.endPresentation(record));
        record.guard.dispose();
        attempt(errors, () => record.transition?.cancel());
        attempt(errors, () => {
            if (!record.view.destroyed) {
                record.view.destroy();
            }
            if (!record.view.destroyed) {
                throw new Error("Native UI destruction did not complete.");
            }
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
        if (!record.shown) {
            return;
        }
        record.shown = false;
        const args = record.args;
        record.args = undefined;
        void Promise.resolve().then(() => {
            try {
                record.route.onClosed?.(record.view, args);
            }
            catch (error) {
                logger.error("[UI] onClosed failed after view cleanup", error);
            }
        });
    }

    private synchronize(): void {
        if (this.disposed || this.synchronizing || this.changingPages) {
            return;
        }
        this.synchronizing = true;
        try {
            const records = this.orderedRecords().filter(record => record.view.parent === this.root && !record.view.destroyed);
            applyLayerOrder(records.map(record => ({ view: record.view, layer: record.settings.layer, order: record.order })));
            for (const record of records) {
                record.presentation?.bindings.setActive(record.view.activeInHierarchy);
            }
            const modal = last(records.filter(record => record.view.active && record.view.visible && record.settings.modal));
            if (!modal) {
                this.mask?.removeSelf();
                syncDisplayOrder(this.root);
                return;
            }
            if (!this.mask) {
                this.mask = new Laya.Sprite();
                this.mask.name = "uiModalMask";
                this.mask.mouseEnabled = true;
                this.mask.graphics.drawRect(0, 0, 1, 1, Laya.UIConfig2.modalLayerColor, null, 0, true);
                this.mask.on(Laya.Event.CLICK, this, this.onMaskClick);
            }
            this.mask.pos(0, 0).size(this.root.width, this.root.height);
            if (!this.mask.parent) {
                this.root.addChild(this.mask);
            }
            syncDisplayOrder(this.root, this.mask, modal.view);
        } finally {
            this.synchronizing = false;
        }
    }

    private onMaskClick(event: Laya.Event): void {
        event.stopPropagation();
        const top = last(this.visibleRecords());
        if (this.disposed || !top || top.closing || !top.view.mouseEnabled || !top.settings.modal
            || !top.settings.closeOnMaskClick) {
            return;
        }
        this.closeRecord(top);
    }

    private orderedRecords(): UIViewRecord[] {
        return [...this.records.values()].sort((a, b) => a.settings.layer - b.settings.layer || a.order - b.order);
    }

    private requireCurrentPage(record: UIViewRecord, order: number): void {
        if (record.settings.layout !== "fullscreen") {
            return;
        }
        for (const [layer, replacement] of this.replacements) {
            if (layer >= record.settings.layer && replacement > order) {
                throw new BindingCancelledError();
            }
        }
        if (record.settings.openMode === "replace" && record.owner.parent) {
            throw new Error("A replacing fullscreen page must be opened with session.ui.show(); child pages use openMode 'stack'.");
        }
    }

    private replaceLowerPages(current: UIViewRecord): void {
        if (current.settings.layout !== "fullscreen" || current.settings.openMode !== "replace") {
            return;
        }
        this.replacements.set(current.settings.layer, Math.max(current.order, this.replacements.get(current.settings.layer) ?? 0));
        const errors: unknown[] = [];
        this.changingPages = true;
        try {
            for (const record of [...this.records.values()]) {
                if (record !== current && record.presentation && record.settings.layout === "fullscreen"
                    && record.order < current.order && record.settings.layer <= current.settings.layer) {
                    attempt(errors, () => this.closeRecord(record));
                }
            }
        } finally {
            this.changingPages = false;
            this.synchronize();
        }
        // 新页面已生效；旧持有者清理失败时仍保留新页面，错误可通过诊断查询。
        if (errors.length) {
            logger.error("[UI] replaced pages failed to clean up", new LifetimeCleanupError(errors));
        }
    }

    private isVisible(record: UIViewRecord): boolean {
        return record.view.parent === this.root && record.view.active && record.view.visible && !record.view.destroyed;
    }

    private visibleRecords(): UIViewRecord[] {
        return this.orderedRecords().filter(record => this.isVisible(record));
    }

    private applyLayout(): void {
        if (this.disposed || this.root.destroyed) {
            return;
        }
        const rect = this.viewport ?? this.layout.snapshot().viewport;
        const { width, height } = rect;
        this.root.pos(rect.x, rect.y).size(width, height);
        this.hostLayout = this.viewport ? this.layout.snapshotForHost(rect) : undefined;
        for (const record of this.records.values()) {
            if (record.view.destroyed) {
                continue;
            }
            const apply = (): void => this.layout.applyView(record.view, record.settings.layout, false, this.hostLayout);
            if (record.transition) {
                record.transition.relayout(apply);
            } else {
                apply();
            }
        }
        this.mask?.size(width, height);
    }

    private track<T>(route: ViewRoute, owner: UIViewOwner, operation: Promise<T>): Promise<T> {
        const tracked = operation.then(value => value);
        this.pending.set(tracked, { route, owner });
        tracked.then(() => this.pending.delete(tracked), () => this.pending.delete(tracked));
        return tracked;
    }

    private requireActive(): void {
        if (this.disposed || this.root.destroyed) {
            throw new Error("Scene UI has been disposed.");
        }
    }
}

function bindRuntime(view: Laya.GWidget, args: unknown, session: UIViewSession): void | Promise<void> {
    // 结构契约在 createView 的原生反序列化边界检查。
    return (view as Laya.GWidget & { onBind(args: unknown, session: UIViewSession): void | Promise<void> }).onBind(args, session);
}

function ownedByRoute(owner: UIViewOwner, route: ViewRoute): boolean {
    return !!owner.parent && (owner.parent.route === route || ownedByRoute(owner.parent.owner, route));
}

function attempt(errors: unknown[], action: () => void): void {
    try {
        action();
    } catch (error) {
        errors.push(error);
    }
}

function last<T>(items: readonly T[]): T | undefined {
    return items[items.length - 1];
}

function ownerAlive(owner: UIViewOwner): boolean {
    return owner.open && (!owner.parent || !owner.parent.view.destroyed && ownerAlive(owner.parent.owner));
}
