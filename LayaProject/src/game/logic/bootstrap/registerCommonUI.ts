import type { UIRouter } from "../../../framework/presentation/ui/UIRouter";
import type { UIViewRoute } from "../../../framework/presentation/ui/UIViewRoute";
import type { UIConfirmation, UIConfirmationArgs } from "../presentation/ui/examples/UIConfirmation";
import type { ExampleInventoryContext, ExampleDeliveryContext } from "../presentation/ui/examples/ExampleInventoryContext";
import type { UIInventory, UIInventoryArgs } from "../presentation/ui/examples/UIInventory";
import type { UIFullscreenMid, UIFullscreenMidArgs } from "../presentation/ui/examples/UIFullscreenMid";

/** Application-owned definitions only; each Scene still owns the instances it opens. */
export function registerCommonUI(ui: UIRouter, inventory: ExampleInventoryContext,
    delivery: ExampleDeliveryContext): UIViewRoute<UIInventoryArgs, UIInventory> {
    const centered = ui.registerView<UIFullscreenMidArgs, UIFullscreenMid>({
        id: "lx.examples.fullscreen-mid",
        url: "bootstrap/ui/examples/UIFullscreenMid.lh",
    });
    const confirmation = ui.registerView<UIConfirmationArgs, UIConfirmation>({
        id: "lx.examples.confirm",
        url: "bootstrap/ui/examples/UIConfirmation.lh",
    });
    const route = ui.registerView<UIInventoryArgs, UIInventory>({
        id: "lx.examples.inventory",
        url: "bootstrap/ui/examples/UIInventory.lh",
        bind: (view, args: UIInventoryArgs, session) => view.onBind(args, session, inventory, delivery, confirmation, centered),
    });
    return route;
}
