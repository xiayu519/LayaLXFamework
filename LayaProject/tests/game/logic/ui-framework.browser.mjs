import bindings from "./native-ui-bindings.browser.mjs";
import data from "./ui-data.browser.mjs";
import host from "./ui-host.browser.mjs";

export default function uiFrameworkProbe() {
    return `(async () => {
        const phaseMs = {};
        const measured = async (work, phase) => {
            const started = performance.now();
            try { return await work; }
            finally { phaseMs[phase] = Math.round(performance.now() - started); }
        };
        // Keep layout/multi-resolution assertions in ui-templates.browser.mjs; this probe covers ownership and data.
        // Per-condition deadlines remain in each probe; the runner enforces the overall 30-second budget.
        const binding = await measured(${bindings()}, 'native binding');
        const viewport = await measured(${host()}, 'custom UI host');
        const scenes = await measured((${verifySceneOwnership.toString()})(), 'scene ownership');
        const dataUI = await measured(${data()}, 'data-driven UI');
        return { passed: true, binding, viewport, scenes, dataUI, phaseMs };
    })()`;
}

async function verifySceneOwnership() {
    const { lx, Laya } = globalThis;
    const ui = lx.ui;
    const assert = (condition, message) => { if (!condition) throw new Error(`Scene UI: ${message}`); };
    const frame = () => new Promise(resolve => Laya.timer.frameOnce(1, {}, resolve));
    const wait = async (predicate, message) => {
        const deadline = performance.now() + 4000;
        while (!predicate()) {
            assert(performance.now() < deadline, message);
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    };
    const args = { status: "READY", detail: "Native scene UI / ownership regression" };
    const popupArgs = { title: "场景弹窗", message: "场景退出时回收", confirmText: "确认", onConfirm() {} };
    const originalScene = lx.sceneFlow.current;
    const scope = originalScene.ui;
    const status = scope.snapshot().views.find(item => item.routeId === "lx.status").view;
    const badgeKey = "examples/inventory";
    assert(status.parent === scope.root && scope.root.parent === originalScene && !(status instanceof Laya.GWindow),
        "ordinary UI is not inside its native scene");
    const loaderWindow = ui.listManaged().find(item => item.routeId === "lx.scene-loading").window;
    const popup = await scope.show("lx.examples.confirm", popupArgs);
    await wait(() => popup.mouseEnabled, "popup animation did not finish");
    assert(popup.parent === scope.root && scope.snapshot().views.some(item => item.view === popup),
        "scene popup must be mounted inside the scene host");
    const retained = ui.registerView({ id: "__scene_retained_popup", url: "bootstrap/game/ui/examples/Confirmation.lh",
        layer: 3, layout: "center-popup", multiplicity: "singleton", retention: "hide",
        viewType: popup.constructor, bind() {} });
    const hidden = await scope.show(retained, popupArgs);
    scope.close(retained.id);
    await wait(() => !hidden.parent, "retained popup hide");
    assert(!hidden.destroyed && !hidden.parent, "retained popup should be hidden before scene exit");
    const retainedView = ui.registerView({ id: "__scene_retained_view", url: "bootstrap/game/ui/FrameworkStatus.lh",
        viewType: status.constructor, retention: "hide", bind(view) { view.statusText.text = "CACHED"; } });
    const hiddenView = await scope.show(retainedView, undefined);
    scope.close(retainedView.id);
    assert(!hiddenView.destroyed && !hiddenView.parent && status.active, "closing a page must restore its predecessor");

    const texture = await Laya.loader.load("__lx_probe_shared.png", Laya.Loader.IMAGE);
    const sceneSprite = new Laya.Sprite(), sharedOwner = new Laya.Sprite();
    sceneSprite.graphics.drawTexture(texture, 0, 0, 1, 1);
    sharedOwner.graphics.drawTexture(texture, 0, 0, 1, 1);
    originalScene.addChild(sceneSprite);
    Laya.stage.addChild(sharedOwner);
    const pendingPrefab = await Laya.loader.load(retainedView.url, Laya.Loader.HIERARCHY);
    let bindCalls = 0, resolveLoad;
    const lateRoute = ui.registerView({ id: "__scene_late_view", url: "__scene_delayed.lh",
        viewType: status.constructor, bind() { bindCalls++; } });
    const originalLoad = Laya.loader.load;
    Laya.loader.load = function(url, ...rest) {
        if (url === lateRoute.url) return new Promise(resolve => { resolveLoad = resolve; });
        return originalLoad.call(this, url, ...rest);
    };
    let transition;
    try {
        const pending = scope.show(lateRoute, undefined).then(() => false, () => true);
        lx.ui.redDots.set("examples/inventory", 7);
        transition = lx.sceneFlow.open("lx.examples.scene", args);
        await wait(() => originalScene.destroyed, "old scene was not destroyed");
        assert(await pending, "scene exit must cancel a pending page immediately");
        assert(status.destroyed && hiddenView.destroyed && popup.destroyed && hidden.destroyed,
            "scene exit leaked a visible, retained or badge owner");
        resolveLoad(pendingPrefab);
        await transition;
        assert(bindCalls === 0 && scope.snapshot().views.length === 0, "late load resurrected old UI");
        assert(!texture.destroyed && texture.referenceCount > 0 && sceneSprite.destroyed,
            "scene GC destroyed another owner's shared texture");
        assert(ui.listManaged().find(item => item.routeId === "lx.scene-loading").window === loaderWindow
            && !loaderWindow.destroyed, "scene exit destroyed application Loading");
        const fresh = lx.sceneFlow.current.ui.snapshot().views[0].view;
        assert(fresh.inventoryBadge.visible && fresh.inventoryBadgeCount.text === "7", "new scene did not read the current badge value");
        for (let cycle = 0; cycle < 12; cycle++) {
            const old = lx.sceneFlow.current, oldScope = old.ui;
            if (cycle === 0) {
                const inventory = await oldScope.show("lx.examples.inventory", { title: "离场清理" });
                inventory.midExampleButton.fireClick();
                await wait(() => oldScope.snapshot().views.some(item => item.routeId === "lx.examples.fullscreen-mid"),
                    "nested page did not open before scene exit");
                assert(!inventory.active, "covered fullscreen page must pause native components");
            }
            await oldScope.show("lx.examples.confirm", popupArgs);
            await lx.sceneFlow.open("lx.examples.scene", args);
            assert(old.destroyed && oldScope.snapshot().views.length === 0,
                `scene cycle ${cycle} left a popup owner`);
            await ui.waitForPendingLoads();
            assert(ui.snapshot().scenes.length === 1, `scene cycle ${cycle} accumulated UI scopes`);
        }
        return { passed: true, nativeScenePages: true, sceneLocalPopups: true,
            hiddenCacheDestroyed: true, lateLoadCancelled: true, sharedTexturePreserved: true,
            appLoadingPreserved: true, badgeRebound: true, sceneCycles: 12 };
    } finally {
        Laya.loader.load = originalLoad;
        resolveLoad?.(pendingPrefab);
        await transition?.catch(() => {});
        sharedOwner.destroy();
        if (!sceneSprite.destroyed) sceneSprite.destroy();
        await frame();
        Laya.Scene.gc();
        lx.ui.redDots.set("examples/inventory", 300);
    }
}
