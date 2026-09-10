import { LX } from "../../../../../framework/LX";
import { BaseGameWindow } from "../../../../../framework/presentation/ui/BaseGameWindow";
import type { UIRoute } from "../../../../../framework/presentation/ui/UIRouter";
import type { BindingToken } from "../../../../../framework/application/ui/AsyncBindingGuard";
import type { ExampleConfirmationArgs } from "./ExampleConfirmationWindow";
import { ExampleInventory } from "./ExampleInventory";
import { ExampleInventoryView } from "./ExampleInventoryView";
import { ExampleItemView } from "./ExampleItemView";

export interface ExampleInventoryArgs { readonly title: string; }

export class ExampleInventoryWindow extends BaseGameWindow<ExampleInventoryArgs> {
    private readonly view: ExampleInventoryView;
    private readonly inventory = new ExampleInventory();

    constructor(pane: Laya.GWidget, private readonly confirmationRoute: UIRoute<ExampleConfirmationArgs>) {
        super(pane);
        if (!(pane instanceof ExampleInventoryView)) {
            throw new Error("Inventory.lh must use ExampleInventoryView.");
        }
        this.view = pane;
        // The fullscreen title component lives in top; bind its nested close button explicitly.
        this.closeButton = pane.frame.getChild("closeButton");
        pane.itemList.itemRenderer = (index: number, row: Laya.GWidget): void => {
            if (!(row instanceof ExampleItemView)) throw new Error("Inventory rows must use ExampleItemView.");
            row.render(this.inventory.items[index], index);
        };
        pane.itemList.setVirtual();
    }

    protected onBind(args: ExampleInventoryArgs, token: BindingToken): void {
        const view = this.view;
        let selectedId = this.inventory.items[0].id;
        let opening = false;
        let confirmation: BaseGameWindow<ExampleConfirmationArgs> | undefined;
        const refresh = (): void => {
            token.commit(() => {
                view.summaryText.text = `${this.inventory.items.length} 种物品  /  共 ${this.inventory.totalQuantity} 件`;
                const selected = this.inventory.items.find((item) => item.id === selectedId)!;
                view.selectionText.text = `${selected.name}\n剩余 ${selected.quantity} 件`;
                view.useButton.grayed = selected.quantity === 0;
                view.useButton.mouseEnabled = selected.quantity > 0;
                view.itemList.refreshVirtualList();
            });
        };
        const select = (row: ExampleItemView): void => {
            selectedId = row.itemId;
            refresh();
        };
        const reset = (): void => {
            this.inventory.reset();
            selectedId = this.inventory.items[0].id;
            view.itemList.selection.index = 0;
            view.itemList.scroller.scrollTop(false);
            refresh();
        };
        const use = async (): Promise<void> => {
            if (opening || confirmation?.isShowing || !token.isCurrent()) return;
            const item = this.inventory.items.find((entry) => entry.id === selectedId)!;
            if (item.quantity === 0) return;
            opening = true;
            try {
                const opened = await LX.UI.show(this.confirmationRoute, {
                    title: "使用物品",
                    message: `确定使用 1 件「${item.name}」？\n使用后数量会立即更新。`,
                    confirmText: "确认使用",
                    onConfirm: () => token.commit(() => {
                        if (this.inventory.use(item.id)) {
                            refresh();
                            LX.UI.tip("已使用 1 件物品");
                        }
                    }),
                }, { signal: token.signal });
                if (!token.isCurrent()) opened.hide();
                else confirmation = opened;
            } catch (error) {
                if (token.isCurrent()) {
                    console.error("[UI examples] confirmation failed", error);
                    LX.UI.tip("暂时无法打开，请重试");
                }
            } finally { opening = false; }
        };
        const clickUse = (): void => { void use(); };
        token.commit(() => {
            view.frame.title = args.title;
            view.itemList.numItems = this.inventory.items.length;
            view.itemList.selection.index = 0;
            view.itemList.on(Laya.UIEvent.ClickItem, this, select);
            view.resetButton.on(Laya.Event.CLICK, this, reset);
            view.useButton.on(Laya.Event.CLICK, this, clickUse);
            refresh();
        });
        this.presentation.defer(() => {
            view.itemList.off(Laya.UIEvent.ClickItem, this, select);
            view.resetButton.off(Laya.Event.CLICK, this, reset);
            view.useButton.off(Laya.Event.CLICK, this, clickUse);
            if (confirmation && !confirmation.destroyed) confirmation.hide();
        });
    }
}
