import { describe, expect, it } from "vitest";
import { collectStaticUIRuntimeFailures,
    collectStaticUIViewAssetFailures } from "../../tools/ui-static-contract.mjs";

interface MutableNode {
    _$type: string;
    name: string;
    _$child: MutableNode[];
    height?: number;
    mouseThrough?: boolean;
}

const widget = (name: string, child: MutableNode[] = [], extra: Partial<MutableNode> = {}): MutableNode => ({
    _$type: "GWidget", name, _$child: child, ...extra,
});
const skeleton = () => widget("UIProbe", [
    widget("full"),
    widget("safeContent", [
        widget("top", [], { height: 0, mouseThrough: true }),
        widget("full", [], { mouseThrough: true }),
        widget("mid", [], { mouseThrough: true }),
        widget("bottom", [], { height: 0, mouseThrough: true }),
    ], { mouseThrough: true }),
]);

describe("static UI authoring contract", () => {
    it("accepts a complete serialized window skeleton", () => {
        expect(collectStaticUIViewAssetFailures(skeleton())).toEqual([]);
        const populated = skeleton();
        const top = populated._$child[1]._$child[0];
        top.height = 120;
        top._$child.push(widget("title"));
        expect(collectStaticUIViewAssetFailures(populated)).toEqual([]);
    });

    it("rejects missing, reordered, interactive, or non-widget skeleton slots", () => {
        const asset = skeleton();
        asset._$child.reverse();
        asset._$child[0].mouseThrough = false;
        asset._$child[0]._$child[0].height = 12;
        asset._$child[0]._$child[1]._$type = "Sprite";
        const failures = collectStaticUIViewAssetFailures(asset);
        expect(failures).toEqual(expect.arrayContaining([
            expect.stringContaining("root children must be exactly"),
            expect.stringContaining("root/safeContent must set mouseThrough=true"),
            expect.stringContaining("empty safeContent/top must have height=0"),
            expect.stringContaining("safeContent/full must use GWidget"),
        ]));
    });

    it("rejects runtime-created display nodes and direct static position writes", () => {
        const failures = collectStaticUIRuntimeFailures(`
            class UIProbe {
                private readonly overlay = new Laya.Sprite();
                bind() {
                    this.content.x = 12;
                    (this.content.parent as Laya.GWidget).y = 34;
                    this.button.pos(1, 2);
                    const alias = this.content;
                    alias.x += 1;
                    alias.addChild(new GButton());
                    this.progress.width = 50;
                    const point = new Laya.Point();
                }
            }
        `, "UIProbe.ts");
        expect(failures).toHaveLength(7);
        expect(failures.join("\n")).toMatch(/Laya\.Sprite/);
        expect(failures.join("\n")).toMatch(/GButton/);
        expect(failures.join("\n")).toMatch(/assign 'x'/);
        expect(failures.join("\n")).toMatch(/assign 'y'/);
        expect(failures.join("\n")).toMatch(/call 'pos\(\)'/);
        expect(failures.join("\n")).toMatch(/call 'addChild\(\)'/);
    });

    it("rejects custom UI helpers while allowing data objects and dynamic values", () => {
        expect(collectStaticUIRuntimeFailures(`
            class UIScreen {
                bind() {
                    const lookup = new Map();
                    const overlay = new ConfirmOverlay();
                    const image = new UIDynamicImage();
                    this.progress.width = Math.round(100 * this.value);
                }
            }
        `)).toEqual([
            expect.stringContaining("ConfirmOverlay"),
            expect.stringContaining("UIDynamicImage"),
        ]);
    });

    it("ignores examples inside comments and strings", () => {
        expect(collectStaticUIRuntimeFailures(`
            // const node = new Laya.Sprite();
            const example = "this.panel.x = 10; this.panel.addChild(new GButton())";
            /* this.panel.pos(1, 2); */
        `)).toEqual([]);
    });
});
