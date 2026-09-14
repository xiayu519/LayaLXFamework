import { BaseWorld } from "../../../../framework/application/world/BaseWorld";
import { xlog } from "../../../../framework/xlog";
import type { WorldScope } from "../../../../framework/bootstrap/WorldScope";
import type { ExampleInventoryContext } from "../../presentation/ui/examples/ExampleInventoryContext";
import type { UIBattle } from "../../presentation/ui/examples/UIBattle";
import type { UILobbyArgs } from "../../presentation/ui/examples/UILobby";
import { BATTLE_WORLD } from "../../application/ExampleWorlds";
import { BATTLE_SCENE } from "../ExampleSceneRoutes";

export class BattleWorld extends BaseWorld<WorldScope> {
    /** 战斗内部的返回请求，只在本次战斗 World 的事件源派发。 */
    public static readonly RETURN_LOBBY = "battle:return-lobby";
    private scene?: typeof BATTLE_SCENE;
    public readonly id = BATTLE_WORLD;

    public constructor(
        private readonly inventory: ExampleInventoryContext,
        private readonly enterLobby: () => Promise<void>,
    ) {
        super();
    }

    protected override onRegister(world: WorldScope): void {
        this.registerEvents(world);
        this.registerUI(world);
        this.registerScenes(world);
    }

    private registerEvents(world: WorldScope): void {
        // 局部事件由战斗自己注册和处理，WorldScope 在退出开始时自动 off。
        world.listen(world.events, BattleWorld.RETURN_LOBBY, this, this.onReturnLobby);
    }

    private registerUI(world: WorldScope): void {
        // 这些注册同时登记退出清理，不需要在 onExit 重复调用 UI/Scene 的销毁接口。
        world.registerView<UILobbyArgs, UIBattle>({
            id: "lx.examples.battle",
            url: "bootstrap/ui/examples/UIBattle.lh",
            bind: (view, args, session) => view.onBind(args, session, this.inventory,
                () => { world.events.event(BattleWorld.RETURN_LOBBY); }),
        });
    }

    private registerScenes(world: WorldScope): void {
        this.scene = world.registerScene(BATTLE_SCENE);
    }

    protected override async onEnter(world: WorldScope): Promise<void> {
        if (!this.scene) {
            throw new Error("World Scene has not been registered.");
        }
        await world.openScene(this.scene, {
            status: "BATTLE",
            detail: "战斗演示",
        });
    }

    protected override onExit(): void {
        // 场景和页面已由登记的清理流程处理；这里只释放本类保留的引用。
        this.scene = undefined;
    }

    private onReturnLobby(): void {
        void this.enterLobby().catch(error => xlog.error("[World examples] return lobby failed", error));
    }
}
