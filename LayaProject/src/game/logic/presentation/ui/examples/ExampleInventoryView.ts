import { ExampleInventoryViewBase } from "./ExampleInventoryView.generated";

const { regClass } = Laya;

/** References are assigned by Inventory.lh; the runtime never creates fixed UI. */
@regClass()
export class ExampleInventoryView extends ExampleInventoryViewBase {
    /** Transient view state survives a hidden page; account quantities belong to the injected service. */
    selectedItemId = "";
}
