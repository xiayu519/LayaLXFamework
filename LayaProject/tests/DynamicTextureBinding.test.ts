import { afterAll, describe, expect, it, vi } from "vitest";
import type { ResourceGroupController } from "../src/framework/application/resource/ResourceGroup";

const pending = new Map<string, (value: object) => void>();
vi.stubGlobal("Laya", {
    Loader: { IMAGE: "image" },
    loader: {
        load: vi.fn((url: string) => new Promise((resolve) => pending.set(url, resolve))),
    },
});

const { DynamicTextureBinding } = await import("../src/framework/presentation/ui/DynamicTextureBinding");

afterAll(() => {
    vi.unstubAllGlobals();
});

describe("DynamicTextureBinding", () => {
    it("rejects stale async writes and releases each owned group", async () => {
        const leaseCounts = new Map<string, number>();
        const released: string[] = [];
        const resources: ResourceGroupController = {
            assign: vi.fn(),
            acquire(group) {
                leaseCounts.set(group, (leaseCounts.get(group) ?? 0) + 1);
                let done = false;
                return {
                    group,
                    get released() { return done; },
                    release() {
                        if (done) return;
                        done = true;
                        leaseCounts.set(group, (leaseCounts.get(group) ?? 1) - 1);
                    },
                };
            },
            releaseGroupIfUnused(group) {
                if ((leaseCounts.get(group) ?? 0) !== 0) return false;
                released.push(group);
                return true;
            },
        };
        const target = { src: "", texture: undefined } as unknown as Laya.GLoader;
        const binding = new DynamicTextureBinding(target, resources);

        const first = binding.set("first.png", "ui:first");
        const second = binding.set("second.png", "ui:second");
        pending.get("first.png")?.({ id: "first" });
        expect(await first).toBe(false);
        pending.get("second.png")?.({ id: "second" });
        expect(await second).toBe(true);
        expect((target.texture as unknown as { id: string }).id).toBe("second");

        binding.clear();
        expect(target.src).toBe("");
        expect(released).toEqual(["ui:first", "ui:second"]);
    });
});
