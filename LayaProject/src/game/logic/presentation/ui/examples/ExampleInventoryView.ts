const { regClass } = Laya;

/** References are assigned by Inventory.lh; the runtime never creates fixed UI. */
@regClass()
export class ExampleInventoryView extends Laya.GWidget {
    frame!: Laya.GLabel;
    itemList!: Laya.GList;
    summaryText!: Laya.GTextField;
    selectionText!: Laya.GTextField;
    useButton!: Laya.GButton;
    resetButton!: Laya.GButton;
    midExampleButton!: Laya.GButton;
}
