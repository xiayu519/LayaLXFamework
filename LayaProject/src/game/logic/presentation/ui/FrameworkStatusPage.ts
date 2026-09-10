import type { UIViewRoute, UIViewSession } from "../../../../framework/presentation/ui/UIViewRoute";
import type { FrameworkStatusView } from "./FrameworkStatusView";
import type { ExampleInventoryArgs } from "./examples/ExampleInventoryPage";
import type { ExampleInventoryView } from "./examples/ExampleInventoryView";
import type { ExampleInventoryContext, ExampleDeliveryContext } from "./examples/ExampleInventoryContext";

export interface FrameworkStatusArgs {
    readonly status: string;
    readonly detail: string;
}

export function bindFrameworkStatus(view: FrameworkStatusView, args: FrameworkStatusArgs,
    session: UIViewSession, inventory: UIViewRoute<ExampleInventoryArgs, ExampleInventoryView>,
    context: ExampleInventoryContext, delivery: ExampleDeliveryContext): void {
    view.statusText.text = args.status;
    view.detailText.text = args.detail;
    session.bindData(context.changes, context.changedEvent, () => {
        view.inventoryText.text = `背包 ${context.state.items.length} 种物品 · 共 ${context.state.totalQuantity} 件`;
    });
    // One view subscribes to two independent feature sources; inventory changes do not refresh delivery controls.
    session.bindData(delivery.changes, delivery.changedEvent, () => {
        view.feedbackText.text = delivery.state.feedback;
        view.rewardButton.grayed = delivery.state.rewardPending;
        view.rewardButton.mouseEnabled = !delivery.state.rewardPending;
        view.rewardButton.title = delivery.state.rewardPending ? "奖励正在送达…" : "模拟服务器奖励（6 秒）";
    });
    session.bindRedDot(view.inventoryBadge, context.redDotKey, { countText: view.inventoryBadgeCount, maxCount: 999 });
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
    view.examplesButton.on(Laya.Event.CLICK, view, click);
    view.rewardButton.on(Laya.Event.CLICK, view, reward);
    view.snapshotButton.on(Laya.Event.CLICK, view, snapshot);
    view.replayButton.on(Laya.Event.CLICK, view, replay);
    session.lifetime.defer(() => {
        view.examplesButton.off(Laya.Event.CLICK, view, click);
        view.rewardButton.off(Laya.Event.CLICK, view, reward);
        view.snapshotButton.off(Laya.Event.CLICK, view, snapshot);
        view.replayButton.off(Laya.Event.CLICK, view, replay);
    });
}
