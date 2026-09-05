import {
    createRuntime,
    type ApplicationAdapters,
    type ApplicationRuntime,
} from "../../../framework/bootstrap/createRuntime";
import type { UIRoute } from "../../../framework/presentation/ui/UIRouter";
import {
    RUNTIME_CONFIG_ID,
    SampleReadyService,
} from "./SampleReadyService";
import {
    FrameworkStatusWindow,
    type FrameworkStatusArgs,
} from "../presentation/ui/FrameworkStatusWindow";
import { GameTablesService } from "../infrastructure/tables/GameTablesService";
import type { Tables } from "../generated/tables/schema";

export const FRAMEWORK_STATUS_ROUTE = "lx.status";
export { RUNTIME_CONFIG_ID };

export type { ApplicationAdapters, ApplicationRuntime };
export type GameTables = Tables;

export function createGameApplication(adapters: ApplicationAdapters = {}): ApplicationRuntime {
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
            const statusContent = content.get(FRAMEWORK_STATUS_ROUTE);
            const statusRoute: UIRoute<FrameworkStatusArgs> = {
                id: statusContent.id,
                url: statusContent.url,
                multiplicity: "singleton",
                retention: "destroy",
                create: (pane) => new FrameworkStatusWindow(pane),
            };
            ui.register(statusRoute);
        },
        createServices(context) {
            return [
                new GameTablesService(context.tables),
                new SampleReadyService(FRAMEWORK_STATUS_ROUTE),
            ];
        },
    }, adapters);
}
