import type { UIViewRoute, UIViewSession } from "../../../../../framework/presentation/ui/UIViewRoute";
import type { UIConfirmationArgs, UIConfirmation } from "./UIConfirmation";
import type { UIFullscreenMidArgs, UIFullscreenMid } from "./UIFullscreenMid";
import type { ExampleInventoryContext, ExampleDeliveryContext } from "./ExampleInventoryContext";
import { UIInventoryItem } from "./UIInventoryItem";
import { UIInventoryBase } from "./UIInventory.generated";

const { regClass } = Laya;

export interface UIInventoryArgs { readonly title: string; }

/** Statically assigned prefab Runtime; presentation behavior stays beside its native node references. */
@regClass()
export class UIInventory extends UIInventoryBase {
    /** Only transient selection belongs to this view; inventory belongs to the account data module. */
    selectedItemId = "";

    /** Called for each presentation; return all asynchronous binding work for owner cleanup. */
    async onBind(args: UIInventoryArgs, session: UIViewSession,
        context: ExampleInventoryContext, delivery: ExampleDeliveryContext,
        confirmationRoute: UIViewRoute<UIConfirmationArgs, UIConfirmation>,
        centeredRoute: UIViewRoute<UIFullscreenMidArgs, UIFullscreenMid>): Promise<void> {
        const atlases = await Laya.loader.load([
            { url: "bootstrap/ui/examples/icons/supplies.atlas", type: Laya.Loader.ATLAS },
            { url: "bootstrap/ui/examples/icons/equipment.atlas", type: Laya.Loader.ATLAS },
        ]);
        if (!session.token.isCurrent()) return;
        if (!Array.isArray(atlases) || atlases.some(atlas => !(atlas instanceof Laya.AtlasResource) || atlas.destroyed)) {
            throw new Error("Inventory icon atlases failed to load.");
        }
        const inventory = context.state;
        const { ui, token, lifetime } = session;
        let opening = false;
        let confirmation: UIConfirmation | undefined;
        let centered: UIFullscreenMid | undefined;
        let openingCentered = false;
        // Keep list size and row data on the same rendered snapshot between native event notifications and callLater.
        let displayedItems = inventory.items;
        this.itemList.itemRenderer = (index, row) => {
            if (!(row instanceof UIInventoryItem)) throw new Error("Inventory rows must use UIInventoryItem.");
            row.render(displayedItems[index], index);
        };
        this.itemList.setVirtual();
        const refresh = (): void => {
            displayedItems = inventory.items;
            this.summaryText.text = `${inventory.items.length} 种物品  /  共 ${inventory.totalQuantity} 件`;
            const selected = inventory.items.find(item => item.id === this.selectedItemId) ?? inventory.items[0];
            this.selectedItemId = selected?.id ?? "";
            this.selectionText.text = selected ? `${selected.name}\n剩余 ${selected.quantity} 件` : "背包暂时没有物品";
            this.useButton.grayed = !selected || selected.quantity === 0;
            this.useButton.mouseEnabled = !!selected && selected.quantity > 0;
            if (this.itemList.numItems !== inventory.items.length) this.itemList.numItems = inventory.items.length;
            else this.itemList.refreshVirtualList();
            this.itemList.selection.index = inventory.items.findIndex(item => item.id === this.selectedItemId);
        };
        const select = (row: UIInventoryItem): void => { this.selectedItemId = row.itemId; refresh(); };
        const reset = (): void => {
            delivery.controls.reset();
            this.selectedItemId = inventory.items[0]?.id ?? "";
            this.itemList.selection.index = 0;
            this.itemList.scroller.scrollTop(false);
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
            const item = inventory.items.find(entry => entry.id === this.selectedItemId);
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
        const close = this.frame.getChild("closeButton");
        this.frame.title = args.title;
        this.itemList.on(Laya.UIEvent.ClickItem, this, select);
        this.resetButton.on(Laya.Event.CLICK, this, reset);
        this.useButton.on(Laya.Event.CLICK, this, clickUse);
        this.midExampleButton.on(Laya.Event.CLICK, this, clickCentered);
        close.on(Laya.Event.CLICK, this, session.close);
        lifetime.defer(() => {
            this.itemList.itemRenderer = null!;
            // Hidden retained pages keep native rows warm, but must release dynamic images and old snapshots.
            for (const row of this.itemList.children) if (row instanceof UIInventoryItem) row.clearBinding();
            this.itemList.itemPool.clear();
            this.itemList.off(Laya.UIEvent.ClickItem, this, select);
            this.resetButton.off(Laya.Event.CLICK, this, reset);
            this.useButton.off(Laya.Event.CLICK, this, clickUse);
            this.midExampleButton.off(Laya.Event.CLICK, this, clickCentered);
            close.off(Laya.Event.CLICK, this, session.close);
        });
        session.bindData(context.changes, context.changedEvent, refresh);
        session.bindRedDot(this.inventoryBadge, context.redDotKey, { countText: this.inventoryBadgeCount, maxCount: 999 });
    }
}
