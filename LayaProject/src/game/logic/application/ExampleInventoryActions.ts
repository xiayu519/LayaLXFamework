import type { ExampleItem, ExampleInventorySnapshot, InventoryApplyResult } from "../domain/ExampleInventory";

/** Readable by any feature or UI; no consumers are registered in the model. */
export interface ExampleInventoryQuery {
    readonly items: readonly ExampleItem[];
    readonly version: number;
    readonly totalQuantity: number;
    snapshot(): ExampleInventorySnapshot;
}

export interface ExampleInventoryCommands {
    /** Online implementations commit responses under the account owner, not the requesting UI. */
    use(id: string): boolean | Promise<boolean>;
}

/** Protocol adapters receive this capability; UI gets queries and business commands only. */
export interface ExampleInventoryReceiver {
    applySnapshot(input: unknown): InventoryApplyResult;
    applyPatch(input: unknown): InventoryApplyResult;
}
