import { afterAll, describe, expect, it, vi } from "vitest";
import type { ResourceGroupController } from "../src/framework/application/resource/ResourceGroup";

class FakeRender {
    useFastRender = false;
    enableCache = false;
    createBone = false;
    templet: unknown;
    play = vi.fn();
    stop = vi.fn();
}

class FakeSprite {
    name = "";
    destroyed = false;
    readonly render = new FakeRender();
    addComponent(): FakeRender { return this.render; }
    destroy(): void { this.destroyed = true; }
}

vi.stubGlobal("Laya", {
    Sprite: FakeSprite,
    Spine2DRenderNode: FakeRender,
    Loader: { SPINE: "SPINE" },
    loader: { load: vi.fn() },
});
const { SpineService } = await import("../src/framework/infrastructure/spine/SpineService");

afterAll(() => vi.unstubAllGlobals());

describe("SpineService", () => {
    it("uses Spine2DRenderNode options and releases the resource lease", async () => {
        const lease = { group: "spine:battle", released: false, release() { this.released = true; } };
        const resources: ResourceGroupController = {
            assign: vi.fn(),
            acquire: vi.fn(() => lease),
            releaseGroupIfUnused: vi.fn(() => true),
        };
        const templet = {};
        vi.mocked(Laya.loader.load).mockResolvedValue(templet as Laya.SpineTemplet);
        const service = new SpineService(resources);

        const handle = await service.create({
            url: "spine/hero.sk",
            group: "spine:battle",
            animation: "idle",
            loop: true,
            useFastRender: false,
            enableCache: true,
        });

        expect(handle.render.templet).toBe(templet);
        expect(handle.render.useFastRender).toBe(false);
        expect(handle.render.enableCache).toBe(true);
        expect(handle.render.play).toHaveBeenCalledWith("idle", true, true, 0, undefined, true, false);
        handle.destroy();
        handle.destroy();
        expect(lease.released).toBe(true);
        expect(resources.releaseGroupIfUnused).toHaveBeenCalledOnce();
    });
});
