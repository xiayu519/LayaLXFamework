import { BaseGameScene, type ScenePhaseContext } from "../../../../framework/presentation/scene/BaseGameScene";
import type { ExampleSceneArgs } from "../../application/ExampleWorlds";

const { regClass } = Laya;

/** The Battle scene selects its own first page; the World registers and unloads this scene. */
@regClass()
export class ExampleBattleScene extends BaseGameScene<ExampleSceneArgs> {
    protected override async onWaitUntilReady(context: ScenePhaseContext<ExampleSceneArgs>): Promise<void> {
        await this.ui.show("lx.examples.battle", context.args, { signal: context.signal });
    }
}
