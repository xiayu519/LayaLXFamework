import type { UIViewRoute, UIViewSession } from "../../../../../framework/presentation/ui/UIViewRoute";
import type { UIInventoryArgs, UIInventory } from "./UIInventory";
import type { ExampleInventoryContext, ExampleDeliveryContext } from "./ExampleInventoryContext";
import { UILobbyBase } from "./UILobby.generated";

const { regClass } = Laya;

export interface UILobbyArgs {
    readonly status: string;
    readonly detail: string;
}

/** Statically assigned prefab Runtime; presentation behavior stays beside its native node references. */
@regClass()
export class UILobby extends UILobbyBase {
    /** Called for each presentation; return all asynchronous binding work for owner cleanup. */
    onBind(args: UILobbyArgs, session: UIViewSession,
        inventory: UIViewRoute<UIInventoryArgs, UIInventory>,
        context: ExampleInventoryContext, delivery: ExampleDeliveryContext, enterBattle: () => Promise<void>): void {
        this.statusText.text = args.status;
        this.detailText.text = args.detail;
        session.bindData(context.changes, context.changedEvent, () => {
            this.inventoryText.text = `背包 ${context.state.items.length} 种物品 · 共 ${context.state.totalQuantity} 件`;
        });
        // One view subscribes to two independent feature sources.
        session.bindData(delivery.changes, delivery.changedEvent, () => {
            this.feedbackText.text = delivery.state.feedback;
            this.rewardButton.grayed = delivery.state.rewardPending;
            this.rewardButton.mouseEnabled = !delivery.state.rewardPending;
            this.rewardButton.title = delivery.state.rewardPending ? "奖励正在送达…" : "模拟服务器奖励（6 秒）";
        });
        session.bindRedDot(this.inventoryBadge, context.redDotKey, { countText: this.inventoryBadgeCount, maxCount: 999 });
        let opening = false;
        const open = async (): Promise<void> => {
            if (opening || !session.token.isCurrent()) return;
            opening = true;
            try {
                await session.ui.show(inventory, { title: "旅行背包" }, { signal: session.token.signal });
            } catch (error) {
                if (session.token.isCurrent()) {
                    console.error("[UI examples] inventory failed", error);
                    session.ui.tip("暂时无法打开，请重试");
                }
            } finally { opening = false; }
        };
        const click = (): void => { void open(); };
        const reward = (): void => delivery.controls.scheduleReward();
        const snapshot = (): void => delivery.controls.rebuildFromServer();
        const replay = (): void => delivery.controls.replayPreviousResponse();
        const battle = (): void => { void enterBattle().catch(error => console.error("[World examples] enter battle failed", error)); };
        this.examplesButton.on(Laya.Event.CLICK, this, click);
        this.rewardButton.on(Laya.Event.CLICK, this, reward);
        this.snapshotButton.on(Laya.Event.CLICK, this, snapshot);
        this.replayButton.on(Laya.Event.CLICK, this, replay);
        this.battleButton.on(Laya.Event.CLICK, this, battle);
        session.lifetime.defer(() => {
            this.examplesButton.off(Laya.Event.CLICK, this, click);
            this.rewardButton.off(Laya.Event.CLICK, this, reward);
            this.snapshotButton.off(Laya.Event.CLICK, this, snapshot);
            this.replayButton.off(Laya.Event.CLICK, this, replay);
            this.battleButton.off(Laya.Event.CLICK, this, battle);
        });
    }
}
