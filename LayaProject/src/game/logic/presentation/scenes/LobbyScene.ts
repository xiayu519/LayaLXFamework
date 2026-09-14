import { BaseGameScene, type ScenePhaseContext } from "../../../../framework/presentation/scene/BaseGameScene";
import type { ExampleSceneArgs } from "../../application/ExampleWorlds";

const { regClass } = Laya;

/** 大厅 World 持有此场景；原生 uiRoot 持有大厅页面及其打开的窗口。 */
@regClass()
export class LobbyScene extends BaseGameScene<ExampleSceneArgs> {
    protected override async onWaitUntilReady(context: ScenePhaseContext<ExampleSceneArgs>): Promise<void> {
        await this.ui.show("lx.status", context.args, { signal: context.signal });
    }
}
