import type { ExampleInventoryQuery, ExampleInventoryReceiver } from "../../application/ExampleInventoryActions";
import type { ExampleInventory, InventoryApplyResult } from "../../domain/ExampleInventory";

export const EXAMPLE_INVENTORY_RED_DOT = "examples/inventory";

/** Account data exists before login, independently of services, Worlds and consumers. */
export class ExampleInventoryData extends Laya.EventDispatcher implements ExampleInventoryQuery {
    static readonly CHANGED = "example-inventory:changed";
    private generation = 0;

    constructor(private readonly model: ExampleInventory) { super(); }
    get items() { return this.model.items; }
    get version(): number { return this.model.version; }
    get totalQuantity(): number { return this.model.totalQuantity; }
    snapshot() { return this.model.snapshot(); }

    /** The connection keeps this capability; late packets from a previous account become invalid. */
    createReceiver(): ExampleInventoryReceiver {
        const generation = this.generation;
        const apply = (action: () => InventoryApplyResult): InventoryApplyResult => {
            if (generation !== this.generation) return "invalid";
            const result = action();
            if (result === "applied") this.event(ExampleInventoryData.CHANGED);
            return result;
        };
        return {
            applySnapshot: input => apply(() => this.model.applySnapshot(input)),
            applyPatch: input => apply(() => this.model.applyPatch(input)),
        };
    }

    clear(): void {
        ++this.generation;
        this.model.clear();
        this.event(ExampleInventoryData.CHANGED);
    }
    dispose(): void { this.clear(); this.offAll(); }
}
