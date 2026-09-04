import { describe, expect, it } from "vitest";
import {
    SceneRouter,
    StaleSceneNavigationError,
    type SceneDriver,
} from "../src/framework/application/scene/SceneRouter";

interface FakeScene {
    url: string;
}

describe("SceneRouter", () => {
    it("closes a late scene when a newer navigation wins", async () => {
        const resolvers = new Map<string, (scene: FakeScene) => void>();
        const closed: string[] = [];
        const driver: SceneDriver<FakeScene> = {
            open: (url) => new Promise((resolve) => resolvers.set(url, resolve)),
            close: (scene) => closed.push(scene.url),
        };
        const router = new SceneRouter([
            { id: "one", url: "one.ls" },
            { id: "two", url: "two.ls" },
        ], driver);

        const first = router.open("one");
        const second = router.open("two");
        resolvers.get("two.ls")?.({ url: "two.ls" });
        await expect(second).resolves.toEqual({ url: "two.ls" });
        resolvers.get("one.ls")?.({ url: "one.ls" });
        await expect(first).rejects.toBeInstanceOf(StaleSceneNavigationError);
        expect(closed).toEqual(["one.ls"]);
    });
});
