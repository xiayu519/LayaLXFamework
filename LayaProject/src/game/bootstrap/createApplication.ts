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
import { GameConfigService } from "../infrastructure/config/GameConfigService";
import type { Tables } from "../generated/config/schema";

export const FRAMEWORK_STATUS_ROUTE = "lx.status";

export type { ApplicationAdapters, ApplicationRuntime };
export type GameTables = Tables;

export function createApplication(adapters: ApplicationAdapters = {}): ApplicationRuntime {
    return createRuntime({
        content: [
            {
                id: FRAMEWORK_STATUS_ROUTE,
                url: "bootstrap/ui/FrameworkStatus.lh",
                kind: "ui",
                group: "ui:bootstrap",
            },
        ],
        configureUI(ui, content): void {
            const statusContent = content.get(FRAMEWORK_STATUS_ROUTE);
            const statusRoute: UIRoute<FrameworkStatusArgs> = {
                id: statusContent.id,
                url: statusContent.url,
                group: statusContent.group ?? "ui:default",
                multiplicity: "singleton",
                retention: "hide",
                create: (pane) => new FrameworkStatusWindow(pane),
            };
            ui.register(statusRoute);
        },
        createServices(context) {
            return [new GameConfigService(context.config, context.resources)];
        },
    }, adapters);
}
