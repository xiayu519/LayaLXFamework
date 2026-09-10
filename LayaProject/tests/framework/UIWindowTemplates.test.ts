import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface AssetNode {
    name?: string;
    width: number;
    height: number;
    _$type?: string;
    _$child?: AssetNode[];
    [key: string]: unknown;
}
const asset = (path: string): AssetNode => JSON.parse(readFileSync(`assets/bootstrap/${path}`, "utf8"));
const child = (node: AssetNode, name: string): AssetNode => {
    const found = node._$child?.find(entry => entry.name === name);
    expect(found, `missing ${node.name}/${name}`).toBeDefined();
    return found!;
};

describe("window authoring contract", () => {
    it.each([
        "framework/ui/templates/Fullscreen.lh", "framework/ui/templates/Popup.lh",
        "framework/ui/SceneLoading.lh", "game/ui/FrameworkStatus.lh",
        "game/ui/examples/Inventory.lh", "game/ui/examples/Confirmation.lh",
    ])("keeps safe slots beneath the fullscreen root in %s", path => {
        const root = asset(path);
        expect([root.width, root.height]).toEqual([720, 1280]);
        expect(root._$child?.every(node => ["full", "safeContent"].includes(node.name!))).toBe(true);
        const safe = child(root, "safeContent");
        expect(safe._$child?.every(node => ["top", "full", "mid", "bottom"].includes(node.name!))).toBe(true);
        expect(safe._$child?.some(node => ["full", "mid"].includes(node.name!) && node.width > 0)).toBe(true);
    });

    it("puts every confirmation control inside the animated mid slot", () => {
        const mid = child(child(asset("game/ui/examples/Confirmation.lh"), "safeContent"), "mid");
        expect([mid.width, mid.height]).toEqual([560, 390]);
        for (const name of ["frame", "messageText", "confirmButton", "cancelButton"]) child(mid, name);
    });

    it("keeps fullscreen header, list and actions in their requested slots", () => {
        const safe = child(asset("game/ui/examples/Inventory.lh"), "safeContent");
        child(child(safe, "top"), "frame");
        expect(safe._$child?.some(node => node.name === "mid")).toBe(false);
        child(child(child(safe, "full"), "listPanel"), "itemList");
        child(child(safe, "bottom"), "actions");
    });

    it.each(["VirtualList", "VirtualGrid"])("provides a scrollable item template for %s", name => {
        const list = asset(`framework/ui/templates/${name}.lh`);
        expect(list._$type).toBe("GList");
        expect(list.scroller).toMatchObject({ _$type: "Scroller", direction: 0 });
        expect(list._templateNode).toMatchObject({ _$tmpl: "itemTemplate" });
        expect(list._$child?.[0]._$prefab).toBe(JSON.parse(readFileSync(
            "assets/bootstrap/framework/ui/templates/ListItem.lh.meta", "utf8",
        )).uuid);
    });

    it("keeps visual chrome separate from window skeletons", () => {
        const chrome = asset("game/ui/examples/PanelChrome.lh");
        expect(chrome.name).toBe("PanelChrome");
        expect(chrome._$child?.some(node => node.name === "safeContent")).toBe(false);
        child(chrome, "closeButton");
    });
});
