import { BaseGameScene, type ScenePhaseContext } from "../../../../framework/presentation/scene/BaseGameScene";
import type { ExampleSceneArgs } from "../../application/ExampleWorlds";

const { regClass } = Laya;

/** Scene owned by the lobby World; its native uiRoot owns the lobby page and opened windows. */
@regClass()
export class LobbyScene extends BaseGameScene<ExampleSceneArgs> {
    protected override async onWaitUntilReady(context: ScenePhaseContext<ExampleSceneArgs>): Promise<void> {
        await this.ui.show("lx.status", context.args, { signal: context.signal });
    }
}
