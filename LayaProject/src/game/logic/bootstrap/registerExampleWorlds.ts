import type { RuntimeContext } from "../../../framework/bootstrap/createRuntime";
import type { WorldContext } from "../../../framework/application/world/WorldDefinition";
import { LOBBY_WORLD, BATTLE_WORLD } from "../application/ExampleWorlds";
import { LOBBY_SCENE, BATTLE_SCENE } from "./ExampleSceneRoutes";
import type { UILobby, UILobbyArgs } from "../presentation/ui/examples/UILobby";
import type { UIBattle } from "../presentation/ui/examples/UIBattle";
import type { ExampleInventoryContext, ExampleDeliveryContext } from "../presentation/ui/examples/ExampleInventoryContext";
import type { UIViewRoute } from "../../../framework/presentation/ui/UIViewRoute";
import type { UIInventory, UIInventoryArgs } from "../presentation/ui/examples/UIInventory";

/** App composition installs definitions. Each World registers elements and owns only undo callbacks. */
export function registerExampleWorlds(context: RuntimeContext, inventory: ExampleInventoryContext,
    delivery: ExampleDeliveryContext, inventoryRoute: UIViewRoute<UIInventoryArgs, UIInventory>): { enterLobby(): Promise<void>; stop(): Promise<void> } {
    const { ui, scenes, worlds } = context;
    let stopping = false;
    let navigation: Promise<void> | undefined;
    const switchTo = (from: string, to: string): Promise<void> => {
        if (stopping) return Promise.resolve();
        if (navigation) return navigation;
        const task = (async () => {
            await worlds.exit(from);
            if (!stopping) await worlds.enter(to);
        })();
        navigation = task;
        task.then(() => { if (navigation === task) navigation = undefined; },
            () => { if (navigation === task) navigation = undefined; });
        return task;
    };
    const lobby = { id: LOBBY_WORLD, async initialize(world: WorldContext) {
        const status = ui.registerView<UILobbyArgs, UILobby>({
            id: "lx.status", url: "bootstrap/ui/examples/UILobby.lh",
            bind: (view, args, session) => view.onBind(args, session, inventoryRoute, inventory, delivery,
                () => switchTo(LOBBY_WORLD, BATTLE_WORLD)),
        });
        world.own(() => ui.unregisterView(status));
        scenes.register(LOBBY_SCENE);
        world.own(() => scenes.unregister(LOBBY_SCENE));
        await scenes.open(LOBBY_SCENE, { status: "READY", detail: "大厅 · 旅行补给站\n账号数据已在登录时同步" }, { signal: world.signal });
    } };
    const battle = { id: BATTLE_WORLD, async initialize(world: WorldContext) {
        const route = ui.registerView<UILobbyArgs, UIBattle>({
            id: "lx.examples.battle", url: "bootstrap/ui/examples/UIBattle.lh",
            bind: (view, args, session) => view.onBind(args, session, inventory, () => switchTo(BATTLE_WORLD, LOBBY_WORLD)),
        });
        world.own(() => ui.unregisterView(route));
        scenes.register(BATTLE_SCENE);
        world.own(() => scenes.unregister(BATTLE_SCENE));
        await scenes.open(BATTLE_SCENE, { status: "BATTLE", detail: "战斗演示" }, { signal: world.signal });
    } };
    worlds.register(lobby);
    worlds.register(battle);
    return {
        async enterLobby() { if (!stopping) await worlds.enter(LOBBY_WORLD); },
        async stop() {
            stopping = true;
            const results = await Promise.allSettled([worlds.unregister(lobby), worlds.unregister(battle)]);
            await navigation?.catch(() => {});
            const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
            if (failure) throw failure.reason;
        },
    };
}
