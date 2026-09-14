import { logger } from "../../../../../framework/application/diagnostics/Logger";
import type { UIViewRoute, UIViewSession } from "../../../../../framework/presentation/ui/UIViewRoute";
import type { UIInventoryArgs, UIInventory } from "./UIInventory";
import type { ExampleInventoryContext, ExampleDeliveryContext } from "./ExampleInventoryContext";
import { UILobbyBase } from "./UILobby.generated";

const { regClass } = Laya;

export interface UILobbyArgs {
    readonly status: string;
    readonly detail: string;
}

/** 资源中静态指定的预制体 Runtime；展示逻辑与原生节点引用集中维护。 */
@regClass()
export class UILobby extends UILobbyBase {
    /** 每次展示时调用；返回全部异步绑定工作，以便持有者清理。 */
    public onBind(args: UILobbyArgs, session: UIViewSession,
        inventory: UIViewRoute<UIInventoryArgs, UIInventory>,
        context: ExampleInventoryContext, delivery: ExampleDeliveryContext, requestBattle: () => void): void {
        this.statusText.text = args.status;
        this.detailText.text = args.detail;
        session.bindData(context.changes, context.changedEvent, () => {
            this.inventoryText.text = `背包 ${context.state.items.length} 种物品 · 共 ${context.state.totalQuantity} 件`;
        });
        // 同一界面订阅两个彼此独立的功能数据源。
        session.bindData(delivery.changes, delivery.changedEvent, () => {
            this.feedbackText.text = delivery.state.feedback;
            this.rewardButton.grayed = delivery.state.rewardPending;
            this.rewardButton.mouseEnabled = !delivery.state.rewardPending;
            this.rewardButton.title = delivery.state.rewardPending ? "奖励正在送达…" : "模拟服务器奖励（6 秒）";
        });
        session.bindRedDot(this.inventoryBadge, context.redDotKey, { countText: this.inventoryBadgeCount, maxCount: 999 });
        let opening = false;
        const open = async (): Promise<void> => {
            if (opening || !session.token.isCurrent()) {
                return;
            }
            opening = true;
            try {
                const sceneUI = session.ui;
                await sceneUI.show(inventory, { title: "旅行背包", onBack: () => sceneUI.show("lx.status", args) },
                    { signal: session.token.signal });
            } catch (error) {
                if (session.token.isCurrent()) {
                    logger.error("[UI examples] inventory failed", error);
                    session.ui.tip("暂时无法打开，请重试");
                }
            } finally {
                opening = false;
            }
        };
        const click = (): void => {
            void open();
        };
        const reward = (): void => delivery.controls.scheduleReward();
        const snapshot = (): void => delivery.controls.rebuildFromServer();
        const replay = (): void => delivery.controls.replayPreviousResponse();
        const battle = (): void => {
            requestBattle();
        };
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
