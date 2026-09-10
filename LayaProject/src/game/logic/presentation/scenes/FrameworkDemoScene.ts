import { BaseGameScene, type ScenePhaseContext } from "../../../../framework/presentation/scene/BaseGameScene";
import type { SceneRoute } from "../../../../framework/presentation/scene/SceneFlow";
import type { FrameworkStatusArgs } from "../ui/FrameworkStatusPage";

const { regClass } = Laya;

export const FRAMEWORK_DEMO_SCENE: SceneRoute<FrameworkStatusArgs> = {
    id: "lx.examples.scene", url: "bootstrap/game/scenes/FrameworkDemo.ls",
};

/** A callable sample scene. Business games keep world/camera nodes beside their screen-space uiRoot. */
@regClass()
export class FrameworkDemoScene extends BaseGameScene<FrameworkStatusArgs> {
    protected override async onWaitUntilReady(context: ScenePhaseContext<FrameworkStatusArgs>): Promise<void> {
        await this.ui.show("lx.status", context.args, { signal: context.signal });
    }
}
