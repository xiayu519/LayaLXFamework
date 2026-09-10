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
    .filter(path => asset(path)._$type === "GWidget" && path !== "assets/bootstrap/ui/UITip.lh");
const child = (node: AssetNode, name: string): AssetNode => {
    const found = node._$child?.find(entry => entry.name === name);
    expect(found, `missing ${node.name}/${name}`).toBeDefined();
    return found!;
};

describe("window authoring contract", () => {
    it.each(windows)("declares the lifecycle script statically in %s", path => {
        const { uuid } = JSON.parse(readFileSync("src/framework/presentation/ui/UIViewLifecycle.ts.meta", "utf8"));
        const components = asset(path)._$comp as { _$type: string; enabled?: boolean; scriptPath: string }[] | undefined;
        const lifecycle = components?.filter(component => component._$type === uuid);
        expect(lifecycle).toHaveLength(1);
        expect(lifecycle![0].enabled).not.toBe(false);
        expect(lifecycle![0].scriptPath).toBe("../src/framework/presentation/ui/UIViewLifecycle.ts");
    });

    it.each(windows)("declares its fixed presentation policy in %s", path => {
        const { uuid } = JSON.parse(readFileSync("src/framework/presentation/ui/UIViewLifecycle.ts.meta", "utf8"));
        const components = asset(path)._$comp as Record<string, unknown>[];
        const settings = components.find(component => component._$type === uuid)!;
        expect(["fullscreen", "center-popup"]).toContain(settings.layout);
        expect([0, 1, 2, 3, 4, 5, 6]).toContain(settings.layer);
        expect(["page", "overlay"]).toContain(settings.navigation);
        expect(typeof settings.modal).toBe("boolean");
        expect(typeof settings.closeOnMaskClick).toBe("boolean");
        expect(["singleton", "multiple"]).toContain(settings.multiplicity);
        expect(["destroy", "hide"]).toContain(settings.retention);
        expect(settings.multiplicity === "multiple" && settings.retention === "hide").toBe(false);
    });

    it.each([
        ["ui/examples/UIConfirmation.lh", { layout: "center-popup", layer: 3, navigation: "overlay", modal: true, closeOnMaskClick: true, multiplicity: "multiple", retention: "destroy" }],
        ["ui/examples/UIInventory.lh", { layout: "fullscreen", layer: 1, navigation: "page", modal: false, multiplicity: "singleton", retention: "hide" }],
        ["ui/examples/UIFullscreenMid.lh", { layout: "fullscreen", layer: 1, navigation: "page", modal: false, multiplicity: "singleton", retention: "destroy" }],
    ] as const)("keeps the intended example policy in %s", (path, expected) => {
        const { uuid } = JSON.parse(readFileSync("src/framework/presentation/ui/UIViewLifecycle.ts.meta", "utf8"));
        const components = asset(path)._$comp as Record<string, unknown>[];
        expect(components.find(component => component._$type === uuid)).toMatchObject(expected);
    });

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
        const mid = child(child(asset("ui/examples/UIConfirmation.lh"), "safeContent"), "mid");
        expect([mid.width, mid.height]).toEqual([560, 390]);
        for (const name of ["frame", "messageText", "confirmButton", "cancelButton"]) child(mid, name);
    });

    it("keeps fullscreen header, list and actions in their requested slots", () => {
        const safe = child(asset("ui/examples/UIInventory.lh"), "safeContent");
        child(child(safe, "top"), "frame");
        expect(child(safe, "mid")._$child ?? []).toEqual([]);
        child(child(child(safe, "full"), "listPanel"), "itemList");
        child(child(safe, "bottom"), "actions");
    });

    it("provides a fullscreen centered example that reuses PanelChrome", () => {
        const safe = child(asset("ui/examples/UIFullscreenMid.lh"), "safeContent");
        expect(child(safe, "full")._$child ?? []).toEqual([]);
        const mid = child(safe, "mid");
        for (const name of ["frame", "counterText", "actionButton"]) child(mid, name);
        expect(child(mid, "frame")._$prefab).toBe(JSON.parse(readFileSync(
            "assets/bootstrap/ui/examples/components/UIPanelChrome.lh.meta", "utf8",
        )).uuid);
    });

    it.each(["VirtualList", "VirtualGrid"])("provides a scrollable item template for %s", name => {
        const list = asset(`ui/examples/templates/UI${name}.lh`);
        expect(list._$type).toBe("GList");
        expect(list.scroller).toMatchObject({ _$type: "Scroller", direction: 0 });
        expect(list._templateNode).toMatchObject({ _$tmpl: "itemTemplate" });
        expect(list._$child?.[0]._$prefab).toBe(JSON.parse(readFileSync(
            "assets/bootstrap/ui/examples/templates/UIListItem.lh.meta", "utf8",
        )).uuid);
    });

    it("keeps visual chrome separate from window skeletons", () => {
        const chrome = asset("ui/examples/components/UIPanelChrome.lh");
        expect(chrome.name).toBe("UIPanelChrome");
        expect(chrome._$child?.some(node => node.name === "safeContent")).toBe(false);
        child(chrome, "closeButton");
    });
});
