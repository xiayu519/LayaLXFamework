import { BaseWorld } from "../../../../framework/application/world/BaseWorld";
import { logger } from "../../../../framework/application/diagnostics/Logger";
import type { WorldScope } from "../../../../framework/bootstrap/WorldScope";
import type { SceneOpenOptions } from "../../../../framework/presentation/scene/SceneFlow";
import type { UIViewRoute } from "../../../../framework/presentation/ui/UIViewRoute";
import type { ExampleInventoryContext, ExampleDeliveryContext } from "../../presentation/ui/examples/ExampleInventoryContext";
import type { UIInventory, UIInventoryArgs } from "../../presentation/ui/examples/UIInventory";
import type { UILobby, UILobbyArgs } from "../../presentation/ui/examples/UILobby";
import { LOBBY_WORLD } from "../../application/ExampleWorlds";
import { LOBBY_SCENE } from "../ExampleSceneRoutes";

/** 注册大厅专用定义；UI 实例由 Scene 持有。 */
export class LobbyWorld extends BaseWorld<WorldScope> {
    /** 大厅内部的导航请求，只在本次大厅 World 的事件源派发。 */
    public static readonly ENTER_BATTLE = "lobby:enter-battle";
    private scene?: typeof LOBBY_SCENE;
    public readonly id = LOBBY_WORLD;

    public constructor(
        private readonly inventory: ExampleInventoryContext,
        private readonly delivery: ExampleDeliveryContext,
        private readonly inventoryRoute: UIViewRoute<UIInventoryArgs, UIInventory>,
        private readonly enterBattle: () => Promise<void>,
        private initialOptions?: Pick<SceneOpenOptions, "showLoading" | "onProgress">,
    ) {
        super();
    }

    protected override registerEvents(world: WorldScope): void {
        // 监听由大厅自己持有；退出开始时自动 off，不登记到 lx.events 或 GameApplication。
        world.listen(world.events, LobbyWorld.ENTER_BATTLE, this, this.onEnterBattle);
    }

    protected override registerUI(world: WorldScope): void {
        // 先登记 UI，再登记 Scene；退出会先卸载 Scene 及其 UI，再注销专属定义。
        world.registerView<UILobbyArgs, UILobby>({
            id: "lx.status",
            url: "bootstrap/ui/examples/UILobby.lh",
            bind: (view, args, session) => view.onBind(
                args, session, this.inventoryRoute, this.inventory, this.delivery,
                () => { world.events.event(LobbyWorld.ENTER_BATTLE); },
            ),
        });
    }

    protected override registerScenes(world: WorldScope): void {
        this.scene = world.registerScene(LOBBY_SCENE);
    }

    protected override async onEnter(world: WorldScope): Promise<void> {
        const startupOptions = this.initialOptions;
        this.initialOptions = undefined;
        if (!this.scene) {
            throw new Error("World Scene has not been registered.");
        }
        await world.openScene(this.scene, {
            status: "READY",
            detail: "大厅 · 旅行补给站\n账号数据已在登录时同步",
        }, startupOptions);
    }

    protected override onExit(): void {
        // Scene、UI 与已登记监听由 WorldScope 清理；这里只释放本类保留的引用。
        this.scene = undefined;
        this.initialOptions = undefined;
    }

    private onEnterBattle(): void {
        // 原生事件不等待异步监听；由所属 World 处理请求失败。
        void this.enterBattle().catch(error => logger.error("[World examples] enter battle failed", error));
    }
}
