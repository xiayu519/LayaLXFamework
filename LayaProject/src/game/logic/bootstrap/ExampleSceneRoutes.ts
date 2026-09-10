import type { SceneRoute } from "../../../framework/presentation/scene/SceneFlow";
import { LOBBY_WORLD, BATTLE_WORLD, type ExampleSceneArgs } from "../application/ExampleWorlds";

export const LOBBY_SCENE: SceneRoute<ExampleSceneArgs> = { id: LOBBY_WORLD, url: "bootstrap/scenes/Lobby.ls" };
export const BATTLE_SCENE: SceneRoute<ExampleSceneArgs> = { id: BATTLE_WORLD, url: "bootstrap/scenes/Battle.ls" };
