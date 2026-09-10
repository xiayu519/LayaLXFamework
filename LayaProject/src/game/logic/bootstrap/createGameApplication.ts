import {
    createRuntime,
    type ApplicationAdapters,
    type ApplicationRuntime,
} from "../../../framework/bootstrap/createRuntime";
import {
    RUNTIME_CONFIG_ID,
    GameReadyService,
} from "./GameReadyService";
import {
    bindFrameworkStatus,
    type FrameworkStatusArgs,
} from "../presentation/ui/FrameworkStatusPage";
import { FrameworkStatusView } from "../presentation/ui/FrameworkStatusView";
import { FRAMEWORK_DEMO_SCENE } from "../presentation/scenes/FrameworkDemoScene";
import { GameTablesService } from "../infrastructure/tables/GameTablesService";
import type { Tables } from "../generated/tables/schema";
import { registerUIExamples } from "./registerUIExamples";
import { ExampleInventoryService, EXAMPLE_INVENTORY_RED_DOT } from "../infrastructure/examples/ExampleInventoryService";
import { ExampleDeliveryService } from "../infrastructure/examples/ExampleDeliveryService";
import type { ExampleInventoryContext, ExampleDeliveryContext } from "../presentation/ui/examples/ExampleInventoryContext";

export const FRAMEWORK_STATUS_ROUTE = "lx.status";
export { RUNTIME_CONFIG_ID };

export type { ApplicationAdapters, ApplicationRuntime };
export type GameTables = Tables;

export function createGameApplication(adapters: ApplicationAdapters = {}): ApplicationRuntime {
    // Each application/account gets its own model, delivery owner and native event source.
    const inventoryService = new ExampleInventoryService();
    const deliveryService = new ExampleDeliveryService(inventoryService);
    const inventory: ExampleInventoryContext = { state: inventoryService, commands: inventoryService,
        changes: inventoryService, changedEvent: ExampleInventoryService.CHANGED, redDotKey: EXAMPLE_INVENTORY_RED_DOT };
    const delivery: ExampleDeliveryContext = { state: deliveryService, controls: deliveryService,
        changes: deliveryService, changedEvent: ExampleDeliveryService.CHANGED };
    return createRuntime({
        content: [
            {
                id: FRAMEWORK_STATUS_ROUTE,
                url: "bootstrap/game/ui/FrameworkStatus.lh",
                kind: "ui",
            },
            {
                id: RUNTIME_CONFIG_ID,
                url: "bootstrap/game/config/runtime.json",
                kind: "data",
            },
        ],
        configureUI(ui, content): void {
            const examplesRoute = registerUIExamples(ui, inventory, delivery);
            const statusContent = content.get(FRAMEWORK_STATUS_ROUTE);
            ui.registerView({
                id: statusContent.id,
                url: statusContent.url,
                layout: "fullscreen",
                retention: "destroy",
                viewType: FrameworkStatusView,
                bind: (view, args: FrameworkStatusArgs, session) => bindFrameworkStatus(view, args, session, examplesRoute, inventory, delivery),
            });
        },
        configureSceneFlow(flow) { flow.register(FRAMEWORK_DEMO_SCENE); },
        createServices(context) {
            const updateBadge = (): void => context.ui.redDots.set(EXAMPLE_INVENTORY_RED_DOT, inventoryService.totalQuantity);
            const badgeOwner = {};
            return [
                new GameTablesService(context.tables),
                inventoryService,
                deliveryService,
                { name: "example-inventory-red-dots",
                    start() { inventoryService.on(ExampleInventoryService.CHANGED, badgeOwner, updateBadge); updateBadge(); },
                    stop() { inventoryService.off(ExampleInventoryService.CHANGED, badgeOwner, updateBadge); } },
                new GameReadyService(FRAMEWORK_DEMO_SCENE.id),
            ];
        },
    }, adapters);
}
