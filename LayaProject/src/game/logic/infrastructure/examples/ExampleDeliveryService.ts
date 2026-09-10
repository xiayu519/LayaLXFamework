import type { AppService } from "../../../../framework/application/lifecycle/AppService";
import type { ExampleDeliveryState, ExampleDeliveryControls } from "../../application/ExampleDelivery";
import { createExampleItems, type ExampleInventorySnapshot, type InventoryApplyResult } from "../../domain/ExampleInventory";
import type { ExampleInventoryService } from "./ExampleInventoryService";

/** Callable server simulator. Replace this adapter with protocol delivery, retaining the inventory. */
export class ExampleDeliveryService extends Laya.EventDispatcher implements AppService, ExampleDeliveryState, ExampleDeliveryControls {
    static readonly CHANGED = "example-delivery:changed";
    readonly name = "example-delivery";
    private running = false;
    private pending = false;
    private message = "补给已就绪，打开背包查看。";
    private previousResponse: ExampleInventorySnapshot;

    constructor(private readonly inventory: ExampleInventoryService) {
        super();
        this.previousResponse = inventory.snapshot();
    }

    get feedback(): string { return this.message; }
    get rewardPending(): boolean { return this.pending; }
    start(): void { this.running = true; }
    stop(): void { this.running = false; this.pending = false; Laya.timer.clearAll(this); this.offAll(); }

    reset(): void {
        if (!this.running) return;
        Laya.timer.clearAll(this);
        this.pending = false;
        this.previousResponse = this.inventory.snapshot();
        this.inventory.reset();
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
        this.previousResponse = this.inventory.snapshot();
        const items = createExampleItems().map((item, index) => index === 0 ? { ...item, quantity: 8 } : item);
        this.report(this.inventory.applySnapshot({ version: this.inventory.version + 1, items }),
            "补给已重新领取，清泉饮水现有 8 件。");
    }

    replayPreviousResponse(): void {
        if (this.running) this.report(this.inventory.applySnapshot(this.previousResponse));
    }

    private readonly deliverReward = (): void => {
        if (!this.running) return;
        this.pending = false;
        this.previousResponse = this.inventory.snapshot();
        const item = this.inventory.items.find(entry => entry.id === "supply-1")
            ?? { id: "supply-1", name: "清泉饮水 · 001", quantity: 0 };
        this.report(this.inventory.applyPatch({ version: this.inventory.version + 1, baseVersion: this.inventory.version,
            upserts: [{ ...item, quantity: item.quantity + 5 }], removedIds: [] }),
        "奖励已到账：清泉饮水 +5，打开背包即可查看。");
    };

    private report(result: InventoryApplyResult, applied = "背包已更新。"): void {
        this.notify(result === "applied" ? applied : result === "stale" ? "重复送达的旧补给已忽略，背包保持最新数量。"
            : result === "base-mismatch" ? "补给尚未同步，请重新领取补给。" : "补给内容有误，背包保持原状。");
    }

    private notify(message: string): void { this.message = message; this.event(ExampleDeliveryService.CHANGED); }
}
