import type { AppService } from "../../../../framework/application/lifecycle/AppService";
import type { ExampleDeliveryState, ExampleDeliveryControls } from "../../application/ExampleDelivery";
import { createExampleItems, type ExampleInventory, type ExampleInventorySnapshot, type InventoryApplyResult } from "../../domain/ExampleInventory";
import type { ExampleInventoryCommands, ExampleInventoryReceiver } from "../../application/ExampleInventoryActions";

/** Callable server simulator. Replace this adapter with protocol delivery, retaining the inventory. */
export class ExampleDeliveryService extends Laya.EventDispatcher implements AppService, ExampleDeliveryState, ExampleDeliveryControls, ExampleInventoryCommands {
    static readonly CHANGED = "example-delivery:changed";
    readonly name = "example-delivery";
    private running = false;
    private pending = false;
    private message = "补给已就绪，打开背包查看。";
    private previousResponse: ExampleInventorySnapshot;

    constructor(private readonly server: ExampleInventory, private readonly receiver: ExampleInventoryReceiver) {
        super();
        this.previousResponse = server.snapshot();
    }

    get feedback(): string { return this.message; }
    get rewardPending(): boolean { return this.pending; }
    /** Simulated login packet is applied before any World/Scene/UI is initialized. */
    start(): void {
        this.running = true;
        this.server.applySnapshot({ version: this.server.version + 1, items: createExampleItems() });
        this.previousResponse = this.server.snapshot();
        if (this.receiver.applySnapshot(this.previousResponse) !== "applied") throw new Error("Example login data was rejected.");
    }
    stop(): void { this.running = false; this.pending = false; Laya.timer.clearAll(this); this.offAll(); }

    reset(): void {
        if (!this.running) return;
        Laya.timer.clearAll(this);
        this.pending = false;
        this.previousResponse = this.server.snapshot();
        this.server.applySnapshot({ version: this.server.version + 1, items: createExampleItems() });
        this.receiver.applySnapshot(this.server.snapshot());
        this.notify("背包已重置，补给恢复为每种 3 件。");
    }

    scheduleReward(): void {
        if (!this.running || this.pending) return;
        this.pending = true;
        Laya.timer.once(6_000, this, this.deliverReward);
        this.notify("奖励将在 6 秒后到账，关闭背包也能收到。");
    }

    rebuildFromServer(): void {
        if (!this.running) return;
        this.previousResponse = this.server.snapshot();
        const items = createExampleItems().map((item, index) => index === 0 ? { ...item, quantity: 8 } : item);
        this.server.applySnapshot({ version: this.server.version + 1, items });
        this.report(this.receiver.applySnapshot(this.server.snapshot()),
            "补给已重新领取，清泉饮水现有 8 件。");
    }

    replayPreviousResponse(): void {
        if (this.running) this.report(this.receiver.applySnapshot(this.previousResponse));
    }

    private readonly deliverReward = (): void => {
        if (!this.running) return;
        this.pending = false;
        this.previousResponse = this.server.snapshot();
        const item = this.server.items.find(entry => entry.id === "supply-1")
            ?? { id: "supply-1", name: "清泉饮水 · 001", quantity: 0 };
        const patch = { version: this.server.version + 1, baseVersion: this.server.version,
            upserts: [{ ...item, quantity: item.quantity + 5 }], removedIds: [] };
        this.server.applyPatch(patch);
        this.report(this.receiver.applyPatch(patch),
        "奖励已到账：清泉饮水 +5，打开背包即可查看。");
    };

    /** The simulator commits a server response; UI never fabricates local inventory revisions. */
    use(id: string): boolean {
        if (!this.running) return false;
        const item = this.server.items.find(entry => entry.id === id);
        if (!item || !item.quantity) return false;
        const patch = { version: this.server.version + 1, baseVersion: this.server.version,
            upserts: [{ ...item, quantity: item.quantity - 1 }], removedIds: [] };
        if (this.server.applyPatch(patch) !== "applied") return false;
        return this.receiver.applyPatch(patch) === "applied";
    }

    private report(result: InventoryApplyResult, applied = "背包已更新。"): void {
        this.notify(result === "applied" ? applied : result === "stale" ? "重复送达的旧补给已忽略，背包保持最新数量。"
            : result === "base-mismatch" ? "补给尚未同步，请重新领取补给。" : "补给内容有误，背包保持原状。");
    }

    private notify(message: string): void { this.message = message; this.event(ExampleDeliveryService.CHANGED); }
}
