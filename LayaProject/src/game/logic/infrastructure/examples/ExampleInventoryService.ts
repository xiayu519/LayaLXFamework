import type { AppService } from "../../../../framework/application/lifecycle/AppService";
import type { ExampleInventoryQuery, ExampleInventoryCommands, ExampleInventoryReceiver } from "../../application/ExampleInventoryActions";
import { ExampleInventory, type InventoryApplyResult } from "../../domain/ExampleInventory";

export const EXAMPLE_INVENTORY_RED_DOT = "examples/inventory";

/** Account-owned inventory: no view registry, UI dependency, transport or presentation state. */
export class ExampleInventoryService extends Laya.EventDispatcher
    implements AppService, ExampleInventoryQuery, ExampleInventoryCommands, ExampleInventoryReceiver {
    static readonly CHANGED = "example-inventory:changed";
    readonly name = "example-inventory";
    private readonly model = new ExampleInventory();
    private running = false;

    get items() { return this.model.items; }
    get version(): number { return this.model.version; }
    get totalQuantity(): number { return this.model.totalQuantity; }
    snapshot() { return this.model.snapshot(); }

    start(): void { this.running = true; this.event(ExampleInventoryService.CHANGED); }
    stop(): void { this.running = false; this.offAll(); }

    applySnapshot(input: unknown): InventoryApplyResult { return this.apply(() => this.model.applySnapshot(input)); }
    applyPatch(input: unknown): InventoryApplyResult { return this.apply(() => this.model.applyPatch(input)); }

    use(id: string): boolean {
        if (!this.running || !this.model.use(id)) return false;
        this.event(ExampleInventoryService.CHANGED);
        return true;
    }

    /** Explicit local demo reset; not a server command. */
    reset(): void {
        if (!this.running) return;
        this.model.reset();
        this.event(ExampleInventoryService.CHANGED);
    }

    private apply(action: () => InventoryApplyResult): InventoryApplyResult {
        if (!this.running) return "invalid";
        const result = action();
        if (result === "applied") this.event(ExampleInventoryService.CHANGED);
        return result;
    }
}
