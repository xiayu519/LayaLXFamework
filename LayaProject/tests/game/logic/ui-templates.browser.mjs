import uiExamplesProbe from "./ui-examples.browser.mjs";

export default function uiTemplatesProbe() {
    return `(async () => {
        const examples = await ${uiExamplesProbe()};
        const templates = await (${runTemplates.toString()})();
        return { passed: true, viewport: innerWidth + 'x' + innerHeight, examples, templates };
    })()`;
}

async function runTemplates() {
    const { LX, Laya } = globalThis;
    const ui = LX.UI, root = Laya.GRoot.inst, platform = LX.Platform;
    const Base = ui.listVisible().find(entry => entry.routeId === "lx.status").window.constructor;
    const assert = (ok, message) => { if (!ok) throw new Error(`UI templates: ${message}`); };
    const wait = async (condition, message) => {
        const end = performance.now() + 4000;
        while (!condition()) {
            assert(performance.now() < end, `timeout: ${message}`);
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    };
    const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const click = (node, x = node.width / 2, y = node.height / 2) => {
        const point = Laya.SpriteUtils.getTransformRelativeToWindow(node, x, y);
        for (const type of ["mousemove", "mousedown", "mouseup"]) {
            document.querySelector("canvas").dispatchEvent(new MouseEvent(type, {
                bubbles: true, clientX: point.x, clientY: point.y, button: 0,
                buttons: type === "mousedown" ? 1 : 0,
            }));
        }
    };
    const maskClick = () => click(root.modalLayer, 2, 2);
    const midOf = window => window.contentPane.getChild("safeContent").getChild("mid");
    const created = [], routes = [], pools = [];
    const originalViewport = Object.getOwnPropertyDescriptor(platform, "viewport");
    const viewport = platform.viewport;
    class ProbeWindow extends Base {
        constructor(pane) {
            super(pane);
            assert(pane.children.map(node => node.name).join("/") === "full/safeContent", "complete root skeleton");
            assert(pane.getChild("safeContent").children.map(node => node.name).join("/") === "top/full/mid/bottom",
                "complete ordered safe-area skeleton");
        }
        closedCount = 0;
        cleaned = false;
        onBind(args, token) {
            this.cleaned = false;
            this.presentation.defer(() => { this.cleaned = true; });
            args.bind?.(this, token, this.presentation);
        }
        onClosed() {
            assert(this.cleaned && !this.isShowing, "close hook ran before presentation cleanup/hide");
            this.closedCount++;
        }
    }
    const register = (name, options = {}) => {
        const route = ui.register({
            id: `lx.template-probe.${name}`, url: "bootstrap/framework/ui/templates/Popup.lh",
            layer: 3, layout: "center-popup", multiplicity: "singleton", retention: "destroy",
            create: pane => { const view = new ProbeWindow(pane); created.push(view); return view; },
            ...options,
        });
        routes.push(route);
        return route;
    };
    const ready = async route => {
        const view = await ui.show(route, {});
        await wait(() => view.mouseEnabled, "show animation");
        return view;
    };
    const shellStable = view => {
        for (const node of [view, view.contentPane, view.contentPane.getChild("safeContent"), root.modalLayer]) {
            assert(node.scaleX === 1 && node.scaleY === 1, "animation scaled fullscreen shell or mask");
        }
        assert(view.width === root.width && view.height === root.height, "popup shell is not fullscreen");
        assert(root.modalLayer.width === root.width && root.modalLayer.height === root.height, "mask lost screen coverage");
    };
    const maskBelow = view => assert(root.getChildIndex(root.modalLayer) === root.getChildIndex(view) - 1,
        "mask is not directly below the highest modal");
    const result = { mask: [], lists: [] };
    try {
        const lowerRoute = register("lower", { retention: "hide" });
        const lower = await ui.show(lowerRoute, {});
        const initialScale = midOf(lower).scaleX;
        shellStable(lower);
        assert(initialScale < 0.5 && !lower.mouseEnabled, "mid did not start its scale animation");
        maskClick();
        assert(!lower.isPopupHiding, "mask closed a popup during its opening animation");
        Object.defineProperty(platform, "viewport", { configurable: true, get: () => ({
            ...viewport, safeArea: { x: 16, y: 44, width: viewport.width - 32, height: viewport.height - 78 },
            topRightAvoidance: { x: viewport.width - 100, y: 48, width: 88, height: 32 },
        }) });
        Laya.stage.event(Laya.Event.RESIZE);
        await wait(() => lower.mouseEnabled, "relayout during show");
        const mid = midOf(lower), safe = lower.contentPane.getChild("safeContent");
        const bounds = ui.layout.snapshot().topSafeArea;
        assert(Math.abs(safe.y + mid.y + mid.height * mid.scaleY / 2 - bounds.y - bounds.height / 2) < 1,
            "old Tween overwrote the resized popup position");
        shellStable(lower);
        click(mid);
        assert(!lower.isPopupHiding && lower.closedCount === 0, "card interior click reached mask");

        const upperRoute = register("upper");
        const upper = await ready(upperRoute);
        maskBelow(upper);
        maskClick();
        assert(upper.isPopupHiding && lower.isShowing, "mask did not close only the top popup");
        maskClick();
        assert(!lower.isPopupHiding, "duplicate mask click closed the lower popup");
        shellStable(upper);
        // Resize while hiding: the previous Tween must never restore obsolete coordinates or fire twice.
        Object.defineProperty(platform, "viewport", { configurable: true, get: () => viewport });
        Laya.stage.event(Laya.Event.RESIZE);
        await wait(() => upper.destroyed, "upper destroy");
        assert(upper.closedCount === 1, `upper close hook count: ${upper.closedCount}, cleaned=${upper.cleaned}, showing=${upper.isShowing}`);
        maskBelow(lower);
        result.mask.push("stack restore / animation input / resize");

        const lockedRoute = register("locked", { closeOnMaskClick: false });
        const locked = await ready(lockedRoute);
        maskClick();
        assert(!locked.isPopupHiding && locked.isShowing, "closeOnMaskClick:false ignored");
        ui.close(lockedRoute.id);
        await wait(() => locked.destroyed, "locked explicit close");
        const customRoute = register("custom", { modal: false });
        const custom = await ready(customRoute);
        maskBelow(lower);
        maskClick();
        assert(!lower.isPopupHiding && !custom.isPopupHiding, "nonmodal top allowed lower mask close");
        // Test-only full-screen control, using the same native Size Relation documented for .lh.
        const full = custom.contentPane.getChild("full");
        const button = new Laya.GButton(); full.addChild(button); button.size(full.width, full.height);
        button.addRelation(full, Laya.RelationType.Size);
        button.on(Laya.Event.CLICK, custom, () => ui.close(customRoute.id));
        click(button, 2, 2);
        await wait(() => custom.destroyed, "custom full-screen close");
        assert(custom.closedCount === 1 && lower.closedCount === 0, "custom close affected lower window");
        result.mask.push("close opt-out / nonmodal / custom full button");

        maskClick();
        await wait(() => !lower.isShowing, "retained hide");
        assert(lower.closedCount === 1 && !lower.destroyed && lower.cleaned, "retained close cleanup");
        const reopened = await ready(lowerRoute);
        assert(reopened === lower, "retained route did not reuse its instance");
        ui.close(lowerRoute.id); ui.close(lowerRoute.id);
        await wait(() => !lower.isShowing, "retained second hide");
        assert(lower.closedCount === 2, "close hook must run once per displayed lifetime");
        lower.destroy();
        assert(lower.closedCount === 2, "hidden destruction repeated the close hook");
        result.mask.push("retained reopen / close hook once");

        const fullscreenRoute = register("fullscreen", { url: "bootstrap/framework/ui/templates/Fullscreen.lh", layout: "fullscreen", layer: 1 });
        const fullscreen = await ready(fullscreenRoute);
        assert(!fullscreen.modal, "fullscreen unexpectedly enabled the mask");
        for (const name of ["VirtualList", "VirtualGrid"]) {
            const prefab = await Laya.loader.load(`bootstrap/framework/ui/templates/${name}.lh`, Laya.Loader.HIERARCHY);
            const list = prefab.create();
            const content = fullscreen.contentPane.getChild("safeContent").getChild("full");
            content.addChild(list);
            list.pos(24, 24); list.size(content.width - 48, content.height - 48);
            list.addRelation(content, Laya.RelationType.Size);
            pools.push(list.itemPool);
            list.itemRenderer = (index, row) => { row.title = `item-${index}`; row.grayed = index % 2 === 0; };
            list.setVirtual(); list.numItems = 100;
            await wait(() => list.numChildren > 3, `${name} virtual rows`);
            const rendered = list.numChildren;
            assert(rendered < 40, `${name} instantiated the full dataset`);
            if (name === "VirtualGrid") {
                const a = list.getChildAt(0), b = list.getChildAt(1), c = list.getChildAt(3);
                assert(b.x > a.x && b.y === a.y && c.y > a.y, "grid is not three columns");
            }
            list.scroller.scrollTo(99, false);
            await frame();
            await wait(() => list.itemIndexToChildIndex(99) >= 0, `${name} final row`);
            const row = list.getChildAt(list.itemIndexToChildIndex(99));
            assert(row.title === "item-99" && !row.grayed, "recycled state is stale");
            click(row);
            assert(list.selection.index === 99, `${name} native selection failed`);
            list.numItems = 0;
            await frame();
            assert(list.numChildren === 0, `${name} empty dataset left rows`);
            list.destroy();
            assert(list.itemPool.count === 0, `${name} native pool survived destruction`);
            result.lists.push({ name, items: 100, rendered });
        }
        ui.close(fullscreenRoute.id);
        await wait(() => fullscreen.destroyed, "fullscreen close");

        const loading = await ready(register("loading-shell", {
            url: "bootstrap/framework/ui/SceneLoading.lh", layout: "fullscreen", layer: 1,
        }));
        const loadingSafe = loading.contentPane.getChild("safeContent");
        assert(loadingSafe.getChild("top").height === 0 && loadingSafe.getChild("bottom").height === 0,
            "unused edge slots reserved space in loading UI");
        assert(loadingSafe.getChild("full").width === loadingSafe.width, "loading empty full failed to adapt");
        loading.destroy();

        const rewardRoute = register("forward-reward", { url: "bootstrap/game/ui/template-probe/RewardProbe.lh" });
        const reward = await ui.show(rewardRoute, { bind: (view, token, scope) => {
            const grid = view.contentPane.findChild("rewardGrid", Laya.GList);
            grid.itemRenderer = (index, row) => { row.title = `reward-${index}`; row.grayed = false; };
            grid.setVirtual(); grid.numItems = 100;
            const cancel = view.contentPane.findChild("cancelButton", Laya.GButton);
            const close = () => token.commit(() => ui.close(rewardRoute.id));
            cancel.on(Laya.Event.CLICK, view, close);
            scope.defer(() => cancel.off(Laya.Event.CLICK, view, close));
        } });
        await wait(() => reward.mouseEnabled, "forward reward show");
        const grid = reward.contentPane.findChild("rewardGrid", Laya.GList);
        assert(grid.numItems === 100 && grid.numChildren < 40, "forward fixture grid is not virtual");
        click(reward.contentPane.findChild("cancelButton", Laya.GButton));
        await wait(() => reward.destroyed, "forward reward cancel");
        assert(grid.itemPool.count === 0 && reward.closedCount === 1, "forward fixture cleanup");
        result.forward = "popup + three-column virtual grid + native cancel";
        return result;
    } finally {
        for (const view of created) if (!view.destroyed) view.destroy();
        await ui.waitForPendingLoads();
        if (originalViewport) Object.defineProperty(platform, "viewport", originalViewport);
        else delete platform.viewport;
        Laya.stage.event(Laya.Event.RESIZE);
        assert(!ui.listManaged().some(entry => entry.routeId.startsWith("lx.template-probe.")), "managed window leaked");
        assert(pools.every(pool => pool.count === 0), "list pool leaked");
    }
}
