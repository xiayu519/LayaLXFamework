import type { PurchaseConfig, PurchaseRecovery } from "../../domain/purchase/PurchaseContracts";
import {
    isPurchaseOrder, needsPurchaseRecovery, PurchaseError, PurchaseEvent,
    type PurchaseFailure, type PurchaseOrder, type PurchaseRecoveryRequest, type PurchaseTransaction,
} from "../../domain/purchase/PurchaseTypes";
import type { AppService, AppServiceContext } from "../lifecycle/AppService";
import { createAbortController } from "../lifecycle/createAbortController";
import { logger } from "../diagnostics/Logger";

interface PurchaseSession {
    readonly accountId: string;
    readonly signal: AbortSignal;
}

/** 根持有支付流程；奖励由游戏数据接入方同步，模块不持有界面或直接发货。 */
export class PurchaseModule implements AppService {
    public readonly name = "purchase";
    private readonly orders = new Map<string, PurchaseOrder>();
    private readonly requests = new Map<string, PurchaseRecoveryRequest>();
    private readonly buys = new Map<string, Promise<PurchaseOrder>>();
    private readonly transactions = new Map<string, Promise<PurchaseOrder>>();
    private readonly confirmations = new Map<string, Promise<PurchaseOrder>>();
    private readonly pending = new Set<Promise<unknown>>();
    private readonly timeoutMs: number;
    private accountValue?: string;
    private accountController = createAbortController();
    private rootController = createAbortController();
    private running = false;
    private reconcileTask?: Promise<readonly PurchaseOrder[]>;
    private stopTask?: Promise<void>;

    public constructor(private readonly config: PurchaseConfig | undefined, private readonly recovery: PurchaseRecovery,
        private readonly publish: (event: string, value: PurchaseOrder | PurchaseFailure | { readonly accountId?: string }) => void) {
        this.timeoutMs = config?.operationTimeoutMs ?? 10_000;
        if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs > 2_147_483_647) {
            throw new Error("Purchase operation timeout is outside the supported range.");
        }
    }

    public get supported(): boolean { return this.config !== undefined; }
    public get accountId(): string | undefined { return this.accountValue; }

    public async start(context?: AppServiceContext): Promise<void> {
        if (this.running) {
            return;
        }
        this.running = true;
        this.stopTask = undefined;
        this.rootController = createAbortController();
        const root = this.rootController.signal;
        const cancel = (): void => this.suspend();
        context?.signal.addEventListener("abort", cancel, { once: true });
        try {
            context?.signal.throwIfAborted();
            if (this.config) {
                await this.invoke(signal => this.config!.channel.start(transaction => {
                    if (!root.aborted && this.running && this.accountValue !== undefined && transaction.accountId === this.accountValue) {
                        void this.receive(transaction).catch(error => this.report("transaction", error, transaction.accountId));
                    }
                }, signal), root);
            }
            root.throwIfAborted();
        } finally {
            context?.signal.removeEventListener("abort", cancel);
        }
    }

    /** 登录同步时绑定账号；换账号立即阻止旧请求回写，原账号恢复记录继续保留。 */
    public setAccount(accountId?: string): void {
        if (accountId === this.accountValue) {
            return;
        }
        this.accountController.abort();
        this.accountController = createAbortController();
        this.accountValue = undefined;
        this.orders.clear();
        this.requests.clear();
        this.buys.clear();
        this.transactions.clear();
        this.confirmations.clear();
        this.reconcileTask = undefined;
        try {
            if (accountId !== undefined) {
                if (!accountId.trim()) {
                    throw new PurchaseError("account", "Purchase account is empty.");
                }
                const saved = this.recovery.load(accountId);
                for (const request of saved) {
                    this.requests.set(request.requestId, Object.freeze({ ...request }));
                }
                this.accountValue = accountId;
            }
        } finally {
            this.notify(PurchaseEvent.ACCOUNT_CHANGED, { accountId: this.accountValue });
        }
    }

    public getOrder(orderId: string): PurchaseOrder | undefined { return this.orders.get(orderId); }

    public snapshot() {
        return { supported: this.supported, running: this.running, accountId: this.accountValue,
            orders: [...this.orders.values()], recoveryRequests: this.requests.size, pendingOperations: this.pending.size };
    }

    public buy(productId: string): Promise<PurchaseOrder> {
        try {
            const session = this.session();
            if (!productId.trim()) {
                throw new PurchaseError("protocol", "Purchase product is empty.");
            }
            const existing = this.buys.get(productId);
            if (existing) {
                return existing;
            }
            const task = Promise.resolve().then(() => this.buyProduct(productId, session));
            this.buys.set(productId, task);
            this.releaseTask(this.buys, productId, task);
            return task;
        } catch (error) {
            return Promise.reject(error);
        }
    }

    /** 首次同步、网络恢复和回到前台可调用；只补查，不自动再次拉起支付。 */
    public reconcile(): Promise<readonly PurchaseOrder[]> {
        if (!this.supported || !this.accountValue) {
            return Promise.resolve([]);
        }
        if (this.reconcileTask) {
            return this.reconcileTask;
        }
        try {
            const session = this.session();
            const task = Promise.resolve().then(() => this.reconcileAccount(session));
            this.reconcileTask = task;
            const clear = (): void => { if (this.reconcileTask === task) this.reconcileTask = undefined; };
            void task.then(clear, clear);
            return task;
        } catch (error) {
            return Promise.reject(error);
        }
    }

    /** 原生前后台事件只触发一次合并查询，不建立轮询计时器。 */
    public onResume(): void {
        if (this.running) {
            const accountId = this.accountValue;
            void this.reconcile().catch(error => this.report("reconcile", error, accountId));
        }
    }

    /** 立即关闭回写入口；实际接入方清理由 stop 等待，不撤销已发生的交易。 */
    public suspend(): void {
        this.running = false;
        this.rootController.abort();
        this.accountController.abort();
    }

    public stop(): Promise<void> {
        if (this.stopTask) {
            return this.stopTask;
        }
        this.suspend();
        const task = Promise.resolve().then(async () => {
            try {
                await this.config?.channel.stop();
            } finally {
                await Promise.allSettled([...this.pending]);
                this.setAccount(undefined);
            }
        });
        this.stopTask = task;
        void task.catch(() => { if (this.stopTask === task) this.stopTask = undefined; });
        return task;
    }

    private async buyProduct(productId: string, session: PurchaseSession): Promise<PurchaseOrder> {
        this.check(session);
        let request = [...this.requests.values()].find(item => item.productId === productId);
        if (request?.launched) {
            await this.reconcile();
            this.check(session);
            const order = [...this.orders.values()].find(item => item.requestId === request!.requestId);
            if (!order) {
                throw new PurchaseError("pending", "Purchase is awaiting order reconciliation.");
            }
            return order;
        }
        if (!request) {
            if (this.requests.size >= 100) {
                throw new PurchaseError("capacity", "Too many unresolved purchase requests; reconcile before buying.");
            }
            request = Object.freeze({ accountId: session.accountId, productId, launched: false,
                requestId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}` });
            this.saveRequest(request);
        }
        const prepared = await this.invoke(signal => this.config!.backend.createOrder(request!, signal), session.signal);
        this.check(session);
        if (prepared.order.requestId !== request.requestId || prepared.order.productId !== productId) {
            throw new PurchaseError("protocol", "Prepared order does not match the purchase request.");
        }
        const order = await this.accept(prepared.order, session);
        this.check(session);
        if (order.status !== "awaiting-payment") {
            return order;
        }
        this.saveRequest({ ...request, launched: true });
        const attempt = await this.invoke(signal => this.config!.channel.launch(order, prepared.channelData, signal), session.signal);
        this.check(session);
        if (!["pending", "submitted", "cancelled", "failed"].includes(attempt.status)
            || attempt.transaction && (attempt.transaction.accountId !== session.accountId || attempt.transaction.productId !== productId)) {
            throw new PurchaseError("protocol", "Payment attempt does not match the purchase request.");
        }
        const updated = await this.invoke(signal => this.config!.backend.reportAttempt(order, attempt, signal), session.signal);
        this.check(session);
        if (updated.orderId !== order.orderId) {
            throw new PurchaseError("protocol", "Payment attempt returned a different order.");
        }
        return this.accept(updated, session);
    }

    private async reconcileAccount(session: PurchaseSession): Promise<readonly PurchaseOrder[]> {
        const failures: unknown[] = [];
        const channel = this.config!.channel;
        if (channel.recover) {
            try {
                const transactions = await this.invoke(signal => channel.recover!(session.accountId, signal), session.signal);
                for (const transaction of transactions) {
                    this.check(session);
                    await this.receive(transaction);
                }
            } catch (error) {
                failures.push(error);
            }
        }
        this.check(session);
        const orders = await this.invoke(signal => this.config!.backend.reconcile(session.accountId, [...this.requests.values()], signal), session.signal);
        for (const order of orders) {
            this.check(session);
            try {
                await this.accept(order, session);
            } catch (error) {
                failures.push(error);
            }
        }
        this.check(session);
        if (failures.length) {
            throw Object.assign(new Error("Purchase reconciliation contains unresolved operations."), { errors: failures });
        }
        return [...this.orders.values()];
    }

    private receive(transaction: PurchaseTransaction): Promise<PurchaseOrder> {
        const session = this.session();
        if (transaction.accountId !== session.accountId || !transaction.channel || !transaction.transactionId || !transaction.productId) {
            return Promise.reject(new PurchaseError("protocol", "Transaction identity or account is invalid."));
        }
        const key = JSON.stringify([transaction.channel, transaction.transactionId]);
        const existing = this.transactions.get(key);
        if (existing) {
            return existing;
        }
        const task = this.invoke(signal => this.config!.backend.verifyTransaction(transaction, signal), session.signal).then(order => {
            this.check(session);
            if (order.productId !== transaction.productId || transaction.orderId && order.orderId !== transaction.orderId
                || order.transaction?.channel !== transaction.channel || order.transaction.transactionId !== transaction.transactionId) {
                throw new PurchaseError("protocol", "Verified order does not match its transaction.");
            }
            return this.accept(order, session);
        });
        this.transactions.set(key, task);
        this.releaseTask(this.transactions, key, task);
        return task;
    }

    private async accept(value: PurchaseOrder, session: PurchaseSession): Promise<PurchaseOrder> {
        this.check(session);
        if (!isPurchaseOrder(value) || value.accountId !== session.accountId) {
            throw new PurchaseError("protocol", "Order snapshot is invalid or belongs to another account.");
        }
        const previous = this.orders.get(value.orderId);
        const request = this.requests.get(value.requestId);
        if (request && request.productId !== value.productId || previous && (previous.requestId !== value.requestId
            || previous.productId !== value.productId || value.revision >= previous.revision
                && JSON.stringify(previous.transaction ?? null) !== JSON.stringify(value.transaction ?? null) && previous.transaction !== undefined)) {
            throw new PurchaseError("protocol", "Order identity changed.");
        }
        if ([...this.orders.values()].some(order => order.orderId !== value.orderId && (order.requestId === value.requestId
            || value.transaction && order.transaction?.channel === value.transaction.channel
                && order.transaction.transactionId === value.transaction.transactionId))) {
            throw new PurchaseError("protocol", "Purchase request or transaction is assigned to multiple orders.");
        }
        let order: PurchaseOrder = Object.freeze({ accountId: value.accountId, requestId: value.requestId,
            orderId: value.orderId, productId: value.productId, revision: value.revision, status: value.status,
            transaction: value.transaction && Object.freeze({ channel: value.transaction.channel, transactionId: value.transaction.transactionId }),
            confirmation: previous?.confirmation === "complete" && value.confirmation === "required" ? "complete" : value.confirmation });
        if (previous && order.revision < previous.revision) {
            order = previous;
        } else if (previous && order.revision === previous.revision && JSON.stringify(order) !== JSON.stringify(previous)) {
            throw new PurchaseError("protocol", "Conflicting order snapshots share a revision.");
        } else if (previous && ["delivered", "revoked"].includes(previous.status)
            && order.status !== previous.status && !(previous.status === "delivered" && order.status === "revoked")) {
            throw new PurchaseError("protocol", "A completed order cannot return to an unpaid state.");
        }
        this.commit(order);
        this.check(session);
        if (order.status !== "delivered" || order.confirmation !== "required") {
            return order;
        }
        const confirming = this.confirmations.get(order.orderId);
        if (confirming) {
            return confirming;
        }
        if (!this.config!.channel.finish) {
            throw new PurchaseError("protocol", "Order requires an unsupported channel confirmation.");
        }
        const task = this.invoke(signal => this.config!.channel.finish!(order.transaction!, signal), session.signal).then(() => {
            this.check(session);
            const latest = this.orders.get(order.orderId)!;
            const confirmed = Object.freeze({ ...latest, confirmation: "complete" as const });
            this.commit(confirmed);
            return confirmed;
        });
        this.confirmations.set(order.orderId, task);
        this.releaseTask(this.confirmations, order.orderId, task);
        return task;
    }

    private commit(order: PurchaseOrder): void {
        const requests = new Map(this.requests);
        if (needsPurchaseRecovery(order)) {
            requests.set(order.requestId, requests.get(order.requestId)
                ?? { accountId: order.accountId, requestId: order.requestId, productId: order.productId, launched: true });
        } else {
            requests.delete(order.requestId);
        }
        if (JSON.stringify([...requests.values()]) !== JSON.stringify([...this.requests.values()])) {
            this.recovery.save(order.accountId, [...requests.values()]);
        }
        this.requests.clear();
        for (const [id, request] of requests) {
            this.requests.set(id, request);
        }
        const previous = this.orders.get(order.orderId);
        this.orders.set(order.orderId, order);
        // 只保留最近的已结束订单；未完成订单的恢复记录不会因缓存容量被丢弃。
        const completed = [...this.orders.values()].filter(item => !needsPurchaseRecovery(item));
        for (const expired of completed.slice(0, Math.max(0, completed.length - 100))) {
            this.orders.delete(expired.orderId);
        }
        if (JSON.stringify(previous) !== JSON.stringify(order)) {
            this.notify(PurchaseEvent.CHANGED, order);
        }
    }

    private saveRequest(request: PurchaseRecoveryRequest): void {
        const next = new Map(this.requests).set(request.requestId, Object.freeze({ ...request }));
        this.recovery.save(request.accountId, [...next.values()]);
        this.requests.set(request.requestId, next.get(request.requestId)!);
    }

    private session(): PurchaseSession {
        if (!this.supported) {
            throw new PurchaseError("unavailable", "Purchase is not configured.");
        }
        if (!this.running) {
            throw new PurchaseError("inactive", "Purchase module is not running.");
        }
        if (!this.accountValue) {
            throw new PurchaseError("account", "Purchase account is not bound.");
        }
        const session = { accountId: this.accountValue, signal: this.accountController.signal };
        this.check(session);
        return session;
    }

    private check(session: PurchaseSession): void {
        session.signal.throwIfAborted();
        if (!this.running || session.accountId !== this.accountValue) {
            throw new PurchaseError("inactive", "Purchase session is no longer active.");
        }
    }

    private releaseTask<T>(tasks: Map<string, Promise<T>>, key: string, task: Promise<T>): void {
        const clear = (): void => { if (tasks.get(key) === task) tasks.delete(key); };
        void task.then(clear, clear);
    }

    private invoke<T>(action: (signal: AbortSignal) => T | Promise<T>, parent: AbortSignal): Promise<T> {
        parent.throwIfAborted();
        const controller = createAbortController();
        const cancel = (): void => controller.abort(parent.reason);
        parent.addEventListener("abort", cancel, { once: true });
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => controller.abort(new PurchaseError("timeout", "Purchase operation timed out; reconciliation is required.")), this.timeoutMs);
            const cleanup = (): void => {
                clearTimeout(timer);
                parent.removeEventListener("abort", cancel);
                controller.signal.removeEventListener("abort", aborted);
            };
            const aborted = (): void => { cleanup(); reject(controller.signal.reason); };
            controller.signal.addEventListener("abort", aborted, { once: true });
            const original = Promise.resolve().then(() => {
                controller.signal.throwIfAborted();
                return action(controller.signal);
            });
            this.pending.add(original);
            void original.then(value => { this.pending.delete(original); cleanup(); resolve(value); },
                error => { this.pending.delete(original); cleanup(); reject(error); });
        });
    }

    private report(operation: string, error: unknown, accountId?: string): void {
        if (this.running && accountId === this.accountValue) {
            this.notify(PurchaseEvent.ERROR, { accountId, operation, error });
        }
    }

    private notify(event: string, value: PurchaseOrder | PurchaseFailure | { readonly accountId?: string }): void {
        try {
            this.publish(event, value);
        } catch (error) {
            // 表现层监听抛错不能中断已经受理的支付或丢失恢复记录。
            logger.error("[LX] PURCHASE OBSERVER ERROR", error);
        }
    }
}
