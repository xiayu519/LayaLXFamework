import {
    createRuntime,
    type ApplicationAdapters,
    type ApplicationRuntime,
} from "../../framework/bootstrap/createRuntime";
import type { UIRoute } from "../../framework/presentation/ui/UIRouter";
import {
    FrameworkStatusWindow,
    type FrameworkStatusArgs,
} from "../presentation/ui/FrameworkStatusWindow";
import { GameTablesService } from "../infrastructure/tables/GameTablesService";
import type { Tables } from "../generated/tables/schema";

export const FRAMEWORK_STATUS_ROUTE = "lx.status";
export const RUNTIME_CONFIG_ID = "lx.runtime-config";

export type { ApplicationAdapters, ApplicationRuntime };
export type GameTables = Tables;

export function createApplication(adapters: ApplicationAdapters = {}): ApplicationRuntime {
    return createRuntime({
        content: [
            {
                id: FRAMEWORK_STATUS_ROUTE,
                url: "bootstrap/ui/FrameworkStatus.lh",
                kind: "ui",
            },
            {
                id: RUNTIME_CONFIG_ID,
                url: "bootstrap/config/runtime.json",
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
            return [new GameTablesService(context.tables)];
        },
    }, adapters);
}
