import type { ExampleItem } from "../../../domain/ExampleInventory";
import { UIInventoryItemBase } from "./UIInventoryItem.generated";

const { regClass } = Laya;

@regClass()
export class UIInventoryItem extends UIInventoryItemBase {
    public itemId = "";

    public render(item: ExampleItem, index: number): void {
        // 虚拟列表行每次渲染都可能对应不同物品。
        this.itemId = item.id;
        this.itemImage.src = inventoryIcon(index);
        this.title = item.name;
        this.quantityText.text = `剩余 ${item.quantity} 件`;
        this.indexText.text = String(index + 1).padStart(2, "0");
        this.grayed = item.quantity === 0;
    }

    /** 本次展示结束时调用；列表销毁时也会释放池中的原生子节点。 */
    public clearBinding(): void {
        this.itemImage.src = "";
    }
}

function inventoryIcon(index: number): string {
    return `bootstrap/ui/examples/icons/${index % 2 === 0 ? "supplies" : "equipment"}/icon-${index % 4}.png`;
}
