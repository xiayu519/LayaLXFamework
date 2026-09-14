import { BaseGameScene, type ScenePhaseContext } from "../../../../framework/presentation/scene/BaseGameScene";
import type { ExampleSceneArgs } from "../../application/ExampleWorlds";

const { regClass } = Laya;

/** 战斗场景自行选择首个页面；World 负责注册和卸载此场景。 */
@regClass()
export class ExampleBattleScene extends BaseGameScene<ExampleSceneArgs> {
    protected override async onWaitUntilReady(context: ScenePhaseContext<ExampleSceneArgs>): Promise<void> {
        await this.ui.show("lx.examples.battle", context.args, { signal: context.signal });
    }
}
