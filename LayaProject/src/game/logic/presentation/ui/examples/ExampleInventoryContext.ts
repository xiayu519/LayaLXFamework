import type { ExampleInventoryCommands, ExampleInventoryQuery } from "../../../application/ExampleInventoryActions";
import type { ExampleDeliveryState, ExampleDeliveryControls } from "../../../application/ExampleDelivery";

/** 多个消费者可共享这些账号能力与原生事件。 */
export interface ExampleInventoryContext {
    readonly state: ExampleInventoryQuery;
    readonly commands: ExampleInventoryCommands;
    readonly changes: Laya.EventDispatcher;
    readonly changedEvent: string;
    readonly redDotKey: string;
}

/** 模拟器控制接口单独注入，与正式背包能力分开。 */
export interface ExampleDeliveryContext {
    readonly state: ExampleDeliveryState;
    readonly controls: ExampleDeliveryControls;
    readonly changes: Laya.EventDispatcher;
    readonly changedEvent: string;
}
