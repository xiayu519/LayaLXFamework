import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface AssetNode {
    name?: string;
    width: number;
    height: number;
    _$type?: string;
    _$child?: AssetNode[];
    [key: string]: unknown;
}
const asset = (path: string): AssetNode => JSON.parse(readFileSync(
    path.startsWith("assets/") ? path : `assets/bootstrap/${path}`, "utf8",
));
// Standalone GWidget UI assets are windows. Tip is the sole pooled notification component.
// GButton/GLabel/GList assets are child components rather than route content panes.
const windows = readdirSync("assets", { recursive: true }).map(String)
    .filter(path => path.endsWith(".lh")).map(path => `assets/${path.split("\\").join("/")}`)
    .filter(path => asset(path)._$type === "GWidget" && path !== "assets/bootstrap/framework/ui/Tip.lh");
const child = (node: AssetNode, name: string): AssetNode => {
    const found = node._$child?.find(entry => entry.name === name);
    expect(found, `missing ${node.name}/${name}`).toBeDefined();
    return found!;
};

describe("window authoring contract", () => {
    it.each(windows)("preserves the complete ordered skeleton in %s", path => {
        const root = asset(path);
        expect([root.width, root.height]).toEqual([720, 1280]);
        expect(root._$child?.map(node => node.name)).toEqual(["full", "safeContent"]);
        const safe = child(root, "safeContent");
        expect(safe._$child?.map(node => node.name)).toEqual(["top", "full", "mid", "bottom"]);
        for (const slot of [child(root, "full"), ...safe._$child!]) {
            expect(slot.mouseThrough, `${path}/${slot.name}: transparent shell must pass input`).toBe(true);
            if (["top", "bottom"].includes(slot.name!) && !slot._$child?.length) expect(slot.height).toBe(0);
        }
    });

    it("puts every confirmation control inside the animated mid slot", () => {
        const mid = child(child(asset("game/ui/examples/Confirmation.lh"), "safeContent"), "mid");
        expect([mid.width, mid.height]).toEqual([560, 390]);
        for (const name of ["frame", "messageText", "confirmButton", "cancelButton"]) child(mid, name);
    });

    it("keeps fullscreen header, list and actions in their requested slots", () => {
        const safe = child(asset("game/ui/examples/Inventory.lh"), "safeContent");
        child(child(safe, "top"), "frame");
        expect(child(safe, "mid")._$child ?? []).toEqual([]);
        child(child(child(safe, "full"), "listPanel"), "itemList");
        child(child(safe, "bottom"), "actions");
    });

    it("provides a fullscreen centered example that reuses PanelChrome", () => {
        const safe = child(asset("game/ui/examples/FullscreenMid.lh"), "safeContent");
        expect(child(safe, "full")._$child ?? []).toEqual([]);
        const mid = child(safe, "mid");
        for (const name of ["frame", "counterText", "actionButton"]) child(mid, name);
        expect(child(mid, "frame")._$prefab).toBe(JSON.parse(readFileSync(
            "assets/bootstrap/game/ui/examples/PanelChrome.lh.meta", "utf8",
        )).uuid);
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
