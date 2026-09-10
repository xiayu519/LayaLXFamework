import {
    createRuntime,
    type ApplicationAdapters,
    type ApplicationRuntime,
} from "../../../framework/bootstrap/createRuntime";
import {
    RUNTIME_CONFIG_ID,
    GameReadyService,
} from "./GameReadyService";
import { GameTablesService } from "../infrastructure/tables/GameTablesService";
import type { Tables } from "../generated/tables/schema";
import { registerExampleWorlds } from "./registerExampleWorlds";
import { ExampleInventoryData, EXAMPLE_INVENTORY_RED_DOT } from "../infrastructure/examples/ExampleInventoryData";
import { ExampleInventory } from "../domain/ExampleInventory";
import { EXAMPLE_INVENTORY_DATA } from "../application/ExampleDataKeys";
import { ExampleDeliveryService } from "../infrastructure/examples/ExampleDeliveryService";
import type { ExampleInventoryContext, ExampleDeliveryContext } from "../presentation/ui/examples/ExampleInventoryContext";
import { DefaultSceneLoadingPresenter } from "../presentation/ui/DefaultSceneLoadingPresenter";
import { registerCommonUI } from "./registerCommonUI";
import type { AppService } from "../../../framework/application/lifecycle/AppService";

export { RUNTIME_CONFIG_ID };

export type { ApplicationAdapters, ApplicationRuntime };
export type GameTables = Tables;

export function createGameApplication(adapters: ApplicationAdapters = {}): ApplicationRuntime {
    // Outer account data exists before services start. The second model belongs solely to the mock server.
    const accountInventory = new ExampleInventoryData(new ExampleInventory());
    const deliveryService = new ExampleDeliveryService(new ExampleInventory(), accountInventory.createReceiver());
    const inventory: ExampleInventoryContext = { state: accountInventory, commands: deliveryService,
        changes: accountInventory, changedEvent: ExampleInventoryData.CHANGED, redDotKey: EXAMPLE_INVENTORY_RED_DOT };
    const delivery: ExampleDeliveryContext = { state: deliveryService, controls: deliveryService,
        changes: deliveryService, changedEvent: ExampleDeliveryService.CHANGED };
    return createRuntime({
        tipPrefabUrl: "bootstrap/ui/UITip.lh",
        createSceneLoadingPresenter: ui => new DefaultSceneLoadingPresenter(ui, "bootstrap/ui/UISceneLoading.lh"),
        data: [{ key: EXAMPLE_INVENTORY_DATA, value: accountInventory }],
        content: [
            {
                id: RUNTIME_CONFIG_ID,
                url: "bootstrap/config/runtime.json",
                kind: "data",
            },
        ],
        createServices(context) {
            const inventoryRoute = registerCommonUI(context.ui, inventory, delivery);
            const worlds = registerExampleWorlds(context, inventory, delivery, inventoryRoute);
            const updateBadge = (): void => context.ui.redDots.set(inventory.redDotKey, accountInventory.totalQuantity);
            const inventoryBadges: AppService = {
                name: "inventory-red-dots",
                start() {
                    accountInventory.on(ExampleInventoryData.CHANGED, this, updateBadge);
                    updateBadge();
                },
                stop() { accountInventory.off(ExampleInventoryData.CHANGED, this, updateBadge); },
            };
            return [
                new GameTablesService(context.tables),
                { name: "example-account-data", start() {}, stop() { accountInventory.dispose(); } },
                inventoryBadges,
                deliveryService,
                new GameReadyService(context, worlds),
            ];
        },
    }, adapters);
}
