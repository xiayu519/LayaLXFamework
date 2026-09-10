import type { ExampleInventoryCommands, ExampleInventoryQuery } from "../../../application/ExampleInventoryActions";
import type { ExampleDeliveryState, ExampleDeliveryControls } from "../../../application/ExampleDelivery";

/** Any number of consumers can share these account capabilities and native events. */
export interface ExampleInventoryContext {
    readonly state: ExampleInventoryQuery;
    readonly commands: ExampleInventoryCommands;
    readonly changes: Laya.EventDispatcher;
    readonly changedEvent: string;
    readonly redDotKey: string;
}

/** Simulator controls are injected separately from production inventory capabilities. */
export interface ExampleDeliveryContext {
    readonly state: ExampleDeliveryState;
    readonly controls: ExampleDeliveryControls;
    readonly changes: Laya.EventDispatcher;
    readonly changedEvent: string;
}
