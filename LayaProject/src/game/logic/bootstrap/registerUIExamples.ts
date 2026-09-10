import type { UIRouter } from "../../../framework/presentation/ui/UIRouter";
import type { UIViewRoute } from "../../../framework/presentation/ui/UIViewRoute";
import { UILayer } from "../../../framework/presentation/ui/UILayer";
import { bindConfirmation } from "../presentation/ui/examples/ExampleConfirmationPage";
import { ExampleConfirmationView } from "../presentation/ui/examples/ExampleConfirmationView";
import type { ExampleInventoryContext, ExampleDeliveryContext } from "../presentation/ui/examples/ExampleInventoryContext";
import { bindInventory, type ExampleInventoryArgs } from "../presentation/ui/examples/ExampleInventoryPage";
import { bindFullscreenMid } from "../presentation/ui/examples/ExampleFullscreenMidPage";
import { ExampleInventoryView } from "../presentation/ui/examples/ExampleInventoryView";
import { ExampleFullscreenMidView } from "../presentation/ui/examples/ExampleFullscreenMidView";

/** Optional, callable examples; named games choose whether to install these routes. */
export function registerUIExamples(ui: UIRouter, inventory: ExampleInventoryContext,
    delivery: ExampleDeliveryContext): UIViewRoute<ExampleInventoryArgs, ExampleInventoryView> {
    const centered = ui.registerView({
        id: "lx.examples.fullscreen-mid",
        url: "bootstrap/game/ui/examples/FullscreenMid.lh",
        layer: UILayer.Screen,
        layout: "fullscreen",
        retention: "destroy",
        viewType: ExampleFullscreenMidView,
        bind: bindFullscreenMid,
    });
    const confirmation = ui.registerView({
        id: "lx.examples.confirm",
        url: "bootstrap/game/ui/examples/Confirmation.lh",
        layer: UILayer.Popup,
        layout: "center-popup",
        modal: true,
        closeOnMaskClick: true,
        navigation: "overlay",
        multiplicity: "multiple",
        retention: "destroy",
        viewType: ExampleConfirmationView,
        bind: bindConfirmation,
    });
    return ui.registerView({
        id: "lx.examples.inventory",
        url: "bootstrap/game/ui/examples/Inventory.lh",
        layer: UILayer.Screen,
        layout: "fullscreen",
        retention: "hide",
        navigation: "page",
        viewType: ExampleInventoryView,
        bind: (view, args: ExampleInventoryArgs, session) => bindInventory(view, args, session, inventory, delivery, confirmation, centered),
    });
}
