import { UILayer } from "./UILayer";

export interface TipQueueOptions {
    readonly intervalMs?: number;
    readonly riseDistance?: number;
    readonly visibleMs?: number;
    readonly fadeMs?: number;
    readonly maxQueue?: number;
}

export interface TipQueueSnapshot {
    readonly queued: number;
    readonly active: number;
    readonly shown: number;
    readonly dropped: number;
}

interface TipPool {
    register<TNode extends Laya.Node>(definition: {
        readonly id: string;
        readonly url: string;
        readonly maxIdle: number;
        readonly maxActive?: number;
        onAcquire?(node: TNode): void;
        onRelease?(node: TNode): void;
    }): void;
    acquire<TNode extends Laya.Node>(id: string): Promise<TNode>;
    release(id: string, node: Laya.Node): void;
}

const TIP_POOL_ID = "lx.ui.tip";
const DEFAULT_OPTIONS = Object.freeze({
    intervalMs: 500,
    riseDistance: 90,
    visibleMs: 500,
    fadeMs: 800,
    maxQueue: 32,
});

export class TipQueue {
    private readonly queue: string[] = [];
    private readonly active = new Set<Laya.GWidget>();
    private readonly pending = new Set<Promise<void>>();
    private readonly options: Readonly<Required<TipQueueOptions>>;
    private shown = 0;
    private dropped = 0;
    private pumping = false;
    private disposed = false;

    constructor(
        private readonly pool: TipPool,
        prefabUrl: string,
        options: TipQueueOptions = {},
    ) {
        this.options = Object.freeze({ ...DEFAULT_OPTIONS, ...options });
        validateOptions(this.options);
        pool.register<Laya.GWidget>({
            id: TIP_POOL_ID,
            url: prefabUrl,
            maxIdle: 4,
            maxActive: 4,
            onAcquire: resetTip,
            onRelease: resetTip,
        });
    }

    show(message: string): void {
        this.requireActive();
        const normalized = message.trim();
        if (!normalized) {
            throw new Error("Tip message must not be empty.");
        }
        if (this.queue.length >= this.options.maxQueue) {
            this.queue.shift();
            this.dropped += 1;
        }
        this.queue.push(normalized);
        if (!this.pumping) {
            this.pump();
        }
    }

    snapshot(): TipQueueSnapshot {
        return Object.freeze({
            queued: this.queue.length,
            active: this.active.size,
            shown: this.shown,
            dropped: this.dropped,
        });
    }

    async waitForPending(): Promise<void> {
        while (this.pending.size > 0) {
            await Promise.allSettled(Array.from(this.pending));
        }
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.queue.length = 0;
        this.pumping = false;
        Laya.timer.clearAll(this);
        for (const view of Array.from(this.active)) {
            this.finish(view);
        }
    }

    private pump(): void {
        if (this.disposed) {
            return;
        }
        const message = this.queue.shift();
        if (!message) {
            this.pumping = false;
            return;
        }
        this.pumping = true;
        const operation = this.present(message);
        this.pending.add(operation);
        operation.catch((error: unknown) => {
            console.error("[LX] tip presentation failed", error);
        }).finally(() => {
            this.pending.delete(operation);
            if (!this.disposed) {
                Laya.timer.once(this.options.intervalMs, this, this.pump);
            }
        });
    }

    private async present(message: string): Promise<void> {
        const view = await this.pool.acquire<Laya.GWidget>(TIP_POOL_ID);
        if (this.disposed) {
            this.pool.release(TIP_POOL_ID, view);
            return;
        }
        const root = Laya.GRoot?.inst;
        if (!root) {
            this.pool.release(TIP_POOL_ID, view);
            throw new Error("GRoot is not ready for tip presentation.");
        }
        const messageText = view.getChildByName("messageText");
        if (!(messageText instanceof Laya.GTextField)) {
            this.pool.release(TIP_POOL_ID, view);
            throw new Error("Tip prefab requires a GTextField child named 'messageText'.");
        }

        messageText.text = message;
        root.addChild(view);
        view.zOrder = UILayer.Toast * 1000;
        view.x = Math.round((root.width - view.width) / 2);
        view.y = Math.round(root.height * 0.62);
        const finalY = view.y - this.options.riseDistance;
        this.active.add(view);
        this.shown += 1;

        Laya.Tween.create(view, view)
            .duration(this.options.visibleMs + this.options.fadeMs)
            .to("y", finalY)
            .ease(Laya.Ease.sineOut);
        Laya.Tween.create(view, view)
            .delay(this.options.visibleMs)
            .duration(this.options.fadeMs)
            .to("alpha", 0)
            .ease(Laya.Ease.sineIn)
            .then(() => this.finish(view));
    }

    private finish(view: Laya.GWidget): void {
        if (!this.active.delete(view)) {
            return;
        }
        Laya.Tween.killAll(view);
        this.pool.release(TIP_POOL_ID, view);
    }

    private requireActive(): void {
        if (this.disposed) {
            throw new Error("Tip queue has been disposed.");
        }
    }
}

function resetTip(view: Laya.GWidget): void {
    Laya.Tween.killAll(view);
    view.removeSelf();
    view.alpha = 1;
    view.scaleX = 1;
    view.scaleY = 1;
    view.visible = true;
    const messageText = view.getChildByName("messageText");
    if (messageText instanceof Laya.GTextField) {
        messageText.text = "";
    }
}

function validateOptions(options: Readonly<Required<TipQueueOptions>>): void {
    for (const [name, value] of Object.entries(options)) {
        if (!Number.isFinite(value) || value <= 0) {
            throw new Error(`Tip option '${name}' must be a positive finite number.`);
        }
    }
    if (!Number.isInteger(options.maxQueue)) {
        throw new Error("Tip option 'maxQueue' must be an integer.");
    }
}
