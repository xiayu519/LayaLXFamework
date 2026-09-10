import type { ExampleItem } from "../../../domain/ExampleInventory";
import { ExampleItemViewBase } from "./ExampleItemView.generated";

const { regClass } = Laya;

@regClass()
export class ExampleItemView extends ExampleItemViewBase {
    itemId = "";

    render(item: ExampleItem, index: number): void {
        // A virtual row can represent a different item on every render.
        this.itemId = item.id;
        this.itemImage.src = inventoryIcon(index);
        this.title = item.name;
        this.quantityText.text = `剩余 ${item.quantity} 件`;
        this.indexText.text = String(index + 1).padStart(2, "0");
        this.grayed = item.quantity === 0;
    }

    /** Called when this presentation ends; list destruction also releases pooled native children. */
    clearBinding(): void { this.itemImage.src = ""; }
}

function inventoryIcon(index: number): string {
    return `bootstrap/game/ui/examples/icons/${index % 2 === 0 ? "supplies" : "equipment"}/icon-${index % 4}.png`;
}
