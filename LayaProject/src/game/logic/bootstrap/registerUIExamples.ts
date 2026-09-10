import type { UIRouter, UIRoute } from "../../../framework/presentation/ui/UIRouter";
import { UILayer } from "../../../framework/presentation/ui/UILayer";
import { ExampleConfirmationWindow } from "../presentation/ui/examples/ExampleConfirmationWindow";
import { ExampleInventoryWindow, type ExampleInventoryArgs } from "../presentation/ui/examples/ExampleInventoryWindow";
import { ExampleFullscreenMidWindow } from "../presentation/ui/examples/ExampleFullscreenMidWindow";

/** Optional, callable examples; named games choose whether to install these routes. */
export function registerUIExamples(ui: UIRouter): UIRoute<ExampleInventoryArgs> {
    const centered = ui.register({
        id: "lx.examples.fullscreen-mid",
        url: "bootstrap/game/ui/examples/FullscreenMid.lh",
        layer: UILayer.Screen,
        layout: "fullscreen",
        modal: false,
        multiplicity: "singleton",
        retention: "destroy",
        create: (pane) => new ExampleFullscreenMidWindow(pane),
    });
    const confirmation = ui.register({
        id: "lx.examples.confirm",
        url: "bootstrap/game/ui/examples/Confirmation.lh",
        layer: UILayer.Popup,
        layout: "center-popup",
        modal: true,
        multiplicity: "multiple",
        retention: "destroy",
        create: (pane) => new ExampleConfirmationWindow(pane),
    });
    return ui.register({
        id: "lx.examples.inventory",
        url: "bootstrap/game/ui/examples/Inventory.lh",
        layer: UILayer.Screen,
        layout: "fullscreen",
        modal: false,
        multiplicity: "singleton",
        retention: "destroy",
        create: (pane) => new ExampleInventoryWindow(pane, confirmation, centered),
    });
}
