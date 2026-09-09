import type { ExampleItem } from "./ExampleInventory";

const { regClass } = Laya;

@regClass()
export class ExampleItemView extends Laya.GButton {
    quantityText!: Laya.GTextField;
    indexText!: Laya.GTextField;

    itemId = "";

    render(item: ExampleItem, index: number): void {
        // A virtual row can represent a different item on every render.
        this.itemId = item.id;
        this.title = item.name;
        this.quantityText.text = `剩余 ${item.quantity} 件`;
        this.indexText.text = String(index + 1).padStart(2, "0");
        this.grayed = item.quantity === 0;
    }
}
