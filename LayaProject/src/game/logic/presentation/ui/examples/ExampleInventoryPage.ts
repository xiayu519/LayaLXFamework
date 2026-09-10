import type { UIViewRoute, UIViewSession } from "../../../../../framework/presentation/ui/UIViewRoute";
import type { ExampleConfirmationArgs } from "./ExampleConfirmationPage";
import type { ExampleConfirmationView } from "./ExampleConfirmationView";
import type { ExampleFullscreenMidArgs } from "./ExampleFullscreenMidPage";
import type { ExampleFullscreenMidView } from "./ExampleFullscreenMidView";
import type { ExampleInventoryContext, ExampleDeliveryContext } from "./ExampleInventoryContext";
import type { ExampleInventoryView } from "./ExampleInventoryView";
import { ExampleItemView } from "./ExampleItemView";

export interface ExampleInventoryArgs { readonly title: string; }

/** The prefab Runtime is the actual native view; this callable function supplies example behavior. */
export async function bindInventory(view: ExampleInventoryView, args: ExampleInventoryArgs, session: UIViewSession,
    context: ExampleInventoryContext,
    delivery: ExampleDeliveryContext,
    confirmationRoute: UIViewRoute<ExampleConfirmationArgs, ExampleConfirmationView>,
    centeredRoute: UIViewRoute<ExampleFullscreenMidArgs, ExampleFullscreenMidView>): Promise<void> {
    const atlases = await Laya.loader.load([
        { url: "bootstrap/game/ui/examples/icons/supplies.atlas", type: Laya.Loader.ATLAS },
        { url: "bootstrap/game/ui/examples/icons/equipment.atlas", type: Laya.Loader.ATLAS },
    ]);
    if (!session.token.isCurrent()) return;
    if (!Array.isArray(atlases) || atlases.some(atlas => !(atlas instanceof Laya.AtlasResource) || atlas.destroyed)) {
        throw new Error("Inventory icon atlases failed to load.");
    }
    const inventory = context.state;
    const { ui, token, lifetime } = session;
    let opening = false;
    let confirmation: ExampleConfirmationView | undefined;
    let centered: ExampleFullscreenMidView | undefined;
    let openingCentered = false;
    // Keep list size and row data on the same rendered snapshot between native event notifications and callLater.
    let displayedItems = inventory.items;
    view.itemList.itemRenderer = (index, row) => {
        if (!(row instanceof ExampleItemView)) throw new Error("Inventory rows must use ExampleItemView.");
        row.render(displayedItems[index], index);
    };
    view.itemList.setVirtual();
    const refresh = (): void => {
        displayedItems = inventory.items;
        view.summaryText.text = `${inventory.items.length} 种物品  /  共 ${inventory.totalQuantity} 件`;
        const selected = inventory.items.find(item => item.id === view.selectedItemId) ?? inventory.items[0];
        view.selectedItemId = selected?.id ?? "";
        view.selectionText.text = selected ? `${selected.name}\n剩余 ${selected.quantity} 件` : "背包暂时没有物品";
        view.useButton.grayed = !selected || selected.quantity === 0;
        view.useButton.mouseEnabled = !!selected && selected.quantity > 0;
        if (view.itemList.numItems !== inventory.items.length) view.itemList.numItems = inventory.items.length;
        else view.itemList.refreshVirtualList();
        view.itemList.selection.index = inventory.items.findIndex(item => item.id === view.selectedItemId);
    };
    const select = (row: ExampleItemView): void => { view.selectedItemId = row.itemId; refresh(); };
    const reset = (): void => {
        delivery.controls.reset();
        view.selectedItemId = inventory.items[0]?.id ?? "";
        view.itemList.selection.index = 0;
        view.itemList.scroller.scrollTop(false);
        refresh();
    };
    const openCentered = async (): Promise<void> => {
        if (openingCentered || centered && !centered.destroyed || !token.isCurrent()) return;
        openingCentered = true;
        try {
            const opened = await session.show(centeredRoute, { title: "居中展示" }, { signal: token.signal });
            if (token.isCurrent()) centered = opened;
        }
        catch (error) { if (token.isCurrent()) { console.error("[UI examples] centered page failed", error); ui.tip("暂时无法打开，请重试"); } }
        finally { openingCentered = false; }
    };
    const use = async (): Promise<void> => {
        if (opening || confirmation && !confirmation.destroyed || !token.isCurrent()) return;
        const item = inventory.items.find(entry => entry.id === view.selectedItemId);
        if (!item || item.quantity === 0) return;
        opening = true;
        try {
            const opened = await session.show(confirmationRoute, {
                title: "使用物品", message: `确定使用 1 件「${item.name}」？\n使用后数量会立即更新。`, confirmText: "确认使用",
                onConfirm: async () => {
                    // The action owns its response/model update; only the optional toast belongs to this view.
                    try {
                        const used = await context.commands.use(item.id);
                        if (token.isCurrent()) ui.tip(used ? "已使用 1 件物品" : "物品数量已更新，请重新选择");
                    } catch {
                        if (token.isCurrent()) ui.tip("暂时无法使用，请稍后重试");
                    }
                },
            }, { signal: token.signal });
            if (token.isCurrent()) confirmation = opened;
        } catch (error) {
            if (token.isCurrent()) { console.error("[UI examples] confirmation failed", error); ui.tip("暂时无法打开，请重试"); }
        } finally { opening = false; }
    };
    const clickUse = (): void => { void use(); };
    const clickCentered = (): void => { void openCentered(); };
    const close = view.frame.getChild("closeButton");
    view.frame.title = args.title;
    view.itemList.on(Laya.UIEvent.ClickItem, view, select);
    view.resetButton.on(Laya.Event.CLICK, view, reset);
    view.useButton.on(Laya.Event.CLICK, view, clickUse);
    view.midExampleButton.on(Laya.Event.CLICK, view, clickCentered);
    close.on(Laya.Event.CLICK, view, session.close);
    lifetime.defer(() => {
        view.itemList.itemRenderer = null!;
        // Hidden retained pages keep native rows warm, but must release dynamic images and old snapshots.
        for (const row of view.itemList.children) if (row instanceof ExampleItemView) row.clearBinding();
        view.itemList.itemPool.clear();
        view.itemList.off(Laya.UIEvent.ClickItem, view, select);
        view.resetButton.off(Laya.Event.CLICK, view, reset);
        view.useButton.off(Laya.Event.CLICK, view, clickUse);
        view.midExampleButton.off(Laya.Event.CLICK, view, clickCentered);
        close.off(Laya.Event.CLICK, view, session.close);
    });
    session.bindData(context.changes, context.changedEvent, refresh);
    session.bindRedDot(view.inventoryBadge, context.redDotKey, { countText: view.inventoryBadgeCount, maxCount: 999 });
}
