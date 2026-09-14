import { describe, expect, it } from "vitest";
import { applyLayerOrder } from "../../src/framework/presentation/ui/UILayerOrder";
import { UILayer, UI_LAYER_CAPACITY } from "../../src/framework/presentation/ui/UILayer";

describe("bounded native UI order", () => {
    it("keeps a full layer below the lowest window of the next layer and reuses released space", () => {
        const entries = Array.from({ length: UI_LAYER_CAPACITY }, (_, order) => ({
            view: { zOrder: -1 } as Laya.Sprite, layer: UILayer.Popup, order: order + 10_000_000,
        }));
        const guide = { view: { zOrder: -1 } as Laya.Sprite, layer: UILayer.Guide, order: 0 };
        applyLayerOrder([...entries, guide]);
        expect(entries[0].view.zOrder).toBe(3000);
        expect(entries[entries.length - 1].view.zOrder).toBe(3999);
        expect(guide.view.zOrder).toBe(4000);
        entries.splice(400, 1);
        const extra = { view: { zOrder: -1 } as Laya.Sprite, layer: UILayer.Popup, order: 20_000_000 };
        applyLayerOrder([...entries, extra, guide]);
        expect(extra.view.zOrder).toBe(3999);
        const overflow = { ...extra, view: { zOrder: -1 } as Laya.Sprite, order: 30_000_000 };
        expect(() => applyLayerOrder([...entries, extra, overflow, guide])).toThrow("exceeds");
        expect(extra.view.zOrder).toBe(3999);
        expect(overflow.view.zOrder).toBe(-1);
    });
});
