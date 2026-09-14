import { logger } from "../../../../../framework/application/diagnostics/Logger";
import type { UIViewRoute, UIViewSession } from "../../../../../framework/presentation/ui/UIViewRoute";
import type { UIConfirmationArgs, UIConfirmation } from "./UIConfirmation";
import type { UIFullscreenMidArgs, UIFullscreenMid } from "./UIFullscreenMid";
import type { ExampleInventoryContext, ExampleDeliveryContext } from "./ExampleInventoryContext";
import { UIInventoryItem } from "./UIInventoryItem";
import { UIInventoryBase } from "./UIInventory.generated";

const { regClass } = Laya;

export interface UIInventoryArgs {
    readonly title: string;
    /** 显式页面导航；替换页面时不保留隐藏的返回栈。 */
    readonly onBack?: () => Promise<unknown>;
}

/** 资源中静态指定的预制体 Runtime；展示逻辑与原生节点引用集中维护。 */
@regClass()
export class UIInventory extends UIInventoryBase {
    /** 此界面只持有临时选中状态；背包归账号数据模块持有。 */
    public selectedItemId = "";

    /** 每次展示时调用；返回全部异步绑定工作，以便持有者清理。 */
    public async onBind(args: UIInventoryArgs, session: UIViewSession,
        context: ExampleInventoryContext, delivery: ExampleDeliveryContext,
        confirmationRoute: UIViewRoute<UIConfirmationArgs, UIConfirmation>,
        centeredRoute: UIViewRoute<UIFullscreenMidArgs, UIFullscreenMid>): Promise<void> {
        const atlases = await Laya.loader.load([
            { url: "bootstrap/ui/examples/icons/supplies.atlas", type: Laya.Loader.ATLAS },
            { url: "bootstrap/ui/examples/icons/equipment.atlas", type: Laya.Loader.ATLAS },
        ]);
        if (!session.token.isCurrent()) {
            return;
        }
        if (!Array.isArray(atlases) || atlases.some(atlas => !(atlas instanceof Laya.AtlasResource) || atlas.destroyed)) {
            throw new Error("Inventory icon atlases failed to load.");
        }
        const inventory = context.state;
        const { ui, token, lifetime } = session;
        let opening = false;
        let confirmation: UIConfirmation | undefined;
        let centered: UIFullscreenMid | undefined;
        let openingCentered = false;
        // 从原生事件通知到 callLater 执行期间，列表数量与行数据始终使用同一份展示快照。
        let displayedItems = inventory.items;
        this.itemList.itemRenderer = (index, row) => {
            if (!(row instanceof UIInventoryItem)) {
                throw new Error("Inventory rows must use UIInventoryItem.");
            }
            row.render(displayedItems[index], index);
        };
        this.itemList.setVirtual();
        const refreshSelection = (): void => {
            const selected = inventory.items.find(item => item.id === this.selectedItemId) ?? inventory.items[0];
            this.selectedItemId = selected?.id ?? "";
            this.selectionText.text = selected ? `${selected.name}\n剩余 ${selected.quantity} 件` : "背包暂时没有物品";
            this.useButton.grayed = !selected || selected.quantity === 0;
            this.useButton.mouseEnabled = !!selected && selected.quantity > 0;
            this.itemList.selection.index = inventory.items.findIndex(item => item.id === this.selectedItemId);
        };
        const refresh = (): void => {
            const previous = displayedItems;
            displayedItems = inventory.items;
            this.summaryText.text = `${displayedItems.length} 种物品  /  共 ${inventory.totalQuantity} 件`;
            if (this.itemList.numItems !== displayedItems.length) {
                this.itemList.numItems = displayedItems.length;
            } else if (previous !== displayedItems) {
                // 由原生虚拟列表创建和回收行；只更新发生变化的可见行。
                for (let childIndex = 0; childIndex < this.itemList.numChildren; childIndex++) {
                    const index = this.itemList.childIndexToItemIndex(childIndex);
                    const item = displayedItems[index], old = previous[index];
                    if (item && (item.id !== old?.id || item.name !== old?.name || item.quantity !== old?.quantity)) {
                        (this.itemList.getChildAt(childIndex) as UIInventoryItem).render(item, index);
                    }
                }
            }
            refreshSelection();
        };
        const select = (row: UIInventoryItem): void => {
            this.selectedItemId = row.itemId;
            refreshSelection();
        };
        const reset = (): void => {
            delivery.controls.reset();
            this.selectedItemId = inventory.items[0]?.id ?? "";
            this.itemList.selection.index = 0;
            this.itemList.scroller.scrollTop(false);
            refresh();
        };
        const openCentered = async (): Promise<void> => {
            if (openingCentered || centered && !centered.destroyed || !token.isCurrent()) {
                return;
            }
            openingCentered = true;
            try {
                const opened = await session.show(centeredRoute, { title: "居中展示" }, { signal: token.signal });
                if (token.isCurrent()) {
                    centered = opened;
                }
            }
            catch (error) {
                if (token.isCurrent()) {
                    logger.error("[UI examples] centered page failed", error);
                    ui.tip("暂时无法打开，请重试");
                }
            }
            finally {
                openingCentered = false;
            }
        };
        const use = async (): Promise<void> => {
            if (opening || confirmation && !confirmation.destroyed || !token.isCurrent()) {
                return;
            }
            const item = inventory.items.find(entry => entry.id === this.selectedItemId);
            if (!item || item.quantity === 0) {
                return;
            }
            opening = true;
            try {
                const opened = await session.show(confirmationRoute, {
                    title: "使用物品", message: `确定使用 1 件「${item.name}」？\n使用后数量会立即更新。`, confirmText: "确认使用",
                    onConfirm: async () => {
                        // 业务操作负责响应与模型更新；只有可选的提示消息属于当前界面。
                        try {
                            const used = await context.commands.use(item.id);
                            if (token.isCurrent()) {
                                ui.tip(used ? "已使用 1 件物品" : "物品数量已更新，请重新选择");
                            }
                        } catch {
                            if (token.isCurrent()) {
                                ui.tip("暂时无法使用，请稍后重试");
                            }
                        }
                    },
                }, { signal: token.signal });
                if (token.isCurrent()) {
                    confirmation = opened;
                }
            } catch (error) {
                if (token.isCurrent()) {
                    logger.error("[UI examples] confirmation failed", error);
                    ui.tip("暂时无法打开，请重试");
                }
            } finally {
                opening = false;
            }
        };
        const clickUse = (): void => {
            void use();
        };
        const clickCentered = (): void => {
            void openCentered();
        };
        let returning = false;
        const back = (): void => {
            if (returning || !token.isCurrent()) {
                return;
            }
            if (!args.onBack) {
                session.close();
                return;
            }
            returning = true;
            void Promise.resolve().then(() => token.isCurrent() ? args.onBack?.() : undefined).catch(error => {
                if (token.isCurrent()) {
                    logger.error("[UI examples] return page failed", error);
                    ui.tip("暂时无法返回，请重试");
                }
            }).finally(() => {
                returning = false;
            });
        };
        const close = this.frame.getChild("closeButton");
        this.frame.title = args.title;
        this.itemList.on(Laya.UIEvent.ClickItem, this, select);
        this.resetButton.on(Laya.Event.CLICK, this, reset);
        this.useButton.on(Laya.Event.CLICK, this, clickUse);
        this.midExampleButton.on(Laya.Event.CLICK, this, clickCentered);
        close.on(Laya.Event.CLICK, this, back);
        lifetime.defer(() => {
            this.itemList.itemRenderer = null!;
            // 隐藏保留的页面继续复用原生行，但必须释放动态图片与旧快照。
            for (const row of this.itemList.children) if (row instanceof UIInventoryItem) {
                row.clearBinding();
            }
            this.itemList.itemPool.clear();
            this.itemList.off(Laya.UIEvent.ClickItem, this, select);
            this.resetButton.off(Laya.Event.CLICK, this, reset);
            this.useButton.off(Laya.Event.CLICK, this, clickUse);
            this.midExampleButton.off(Laya.Event.CLICK, this, clickCentered);
            close.off(Laya.Event.CLICK, this, back);
        });
        session.bindData(context.changes, context.changedEvent, refresh);
        session.bindRedDot(this.inventoryBadge, context.redDotKey, { countText: this.inventoryBadgeCount, maxCount: 999 });
    }
}
