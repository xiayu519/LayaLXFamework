export default function navigationProbe() { return `(${verifyNavigation.toString()})()`; }

async function verifyNavigation() {
    const { lx, Laya } = globalThis;
    const assert = (value, message) => { if (!value) throw new Error(`UI navigation: ${message}`); };
    const frame = () => new Promise(resolve => Laya.timer.frameOnce(1, {}, resolve));
    const wait = async (predicate, message) => {
        const end = performance.now() + 4000;
        while (!predicate()) { assert(performance.now() < end, message); await frame(); }
    };
    const roots = [new Laya.GWidget(), new Laya.GWidget()];
    roots.forEach((root, index) => { root.zOrder = 500 + index; Laya.stage.addChild(root); });
    roots[1].visible = false;
    const scopes = roots.map(root => lx.ui.createSceneUI(root));
    const [scope, other] = scopes;
    const routes = [];
    const register = (id, policy, bind = () => {}) => {
        const route = lx.ui.registerView({ id: `probe.navigation.${id}`,
            url: `__lx_resource_prefab.lh?ui=1&source=fullscreen&case=${id}&${policy}`, bind });
        routes.push(route);
        return route;
    };
    let source, current, childSession;
    const page = register("first", "openMode=replace", (_v, _a, session) => { source = session; });
    const popup = register("popup", "layout=center-popup&layer=3&modal=true&openMode=replace", (_v, _a, session) => { childSession = session; });
    const latePopup = register("late-popup", "layout=center-popup&layer=3&modal=false&slow=1");
    const next = register("next", "openMode=replace", (_v, _a, session) => { current = session; });
    const stack = register("stack", "openMode=stack");
    const fail = register("failed", "openMode=replace", () => { throw new Error("expected binding failure"); });
    const slow = register("slow", "openMode=replace&slow=1");
    try {
        const first = await scope.show(page, {});
        const otherPage = await other.show(page, {});
        // 重新绑定当前作用域，使来源指向自身页面，而非第二个场景。
        await scope.show(page, {});
        const ownedPopup = await source.show(popup, {});
        const ownedSession = childSession;
        const independentPopup = await scope.show(popup, {});
        const late = source.show(latePopup, {}).then(() => false, () => true);
        const replacement = await scope.show(next, {}, { signal: source.token.signal });
        assert(first.destroyed && ownedPopup.destroyed && await late, "replacement did not release the old presentation and its children");
        assert(current.token.isCurrent() && replacement.parent === roots[0], "source cancellation killed its successor");
        assert(!independentPopup.destroyed && independentPopup.parent === roots[0], "fullscreen replacement closed an independent popup");
        assert(!otherPage.destroyed && otherPage.parent === roots[1], "replacement crossed scene ownership");
        assert(!ownedSession.token.isCurrent(), "closed child token stayed valid");
        await wait(() => independentPopup.mouseEnabled, "popup animation did not complete");
        const index = roots[0].getChildIndex(independentPopup);
        assert(roots[0].getChildAt(index - 1) === scope.modalLayer, "mask is not immediately below the modal");
        const clicks = { lower: 0 };
        replacement.actionButton.on(Laya.Event.CLICK, clicks, () => { clicks.lower++; });
        const point = Laya.SpriteUtils.getTransformRelativeToWindow(roots[0], 4, 4);
        for (const type of ["mousemove", "mousedown", "mouseup"]) document.querySelector("canvas").dispatchEvent(new MouseEvent(type, {
            bubbles: true, clientX: point.x, clientY: point.y, button: 0, buttons: type === "mousedown" ? 1 : 0,
        }));
        await wait(() => independentPopup.destroyed, "native mask click did not close the top popup");
        assert(clicks.lower === 0 && !scope.modalLayer.parent, "mask click leaked through or left a mask behind");
        const stacked = await scope.show(stack, {});
        assert(!replacement.destroyed && replacement.active && current.token.isCurrent(), "stacking ended the lower page");
        scope.bringToFront(replacement);
        await frame(); await frame();
        assert(replacement.zOrder > stacked.zOrder && replacement.zOrder < 2000
            && roots[0].getChildIndex(replacement) > roots[0].getChildIndex(stacked), "native ordering did not retain the requested layer order");
        let failed = false;
        try { await scope.show(fail, {}); } catch { failed = true; }
        assert(failed && !replacement.destroyed && !stacked.destroyed, "failed page destroyed existing pages");
        const latePage = scope.show(slow, {}).then(() => false, () => true);
        await scope.show(next, {});
        assert(await latePage, "late older fullscreen page replaced its successor");
        await Promise.all(scopes.map(ui => ui.waitForPendingLoads()));
        assert(scope.snapshot().pendingRequests.length === 0, "page replacement retained pending requests");
        return { passed: true, replacement: true, stacking: true, sourceSignalDetached: true,
            popupIndependent: true, childCleanup: true, sceneIsolation: true, maskNativeClick: true,
            sameLayerOrder: true, failedOpenPreservesPages: true, latePageCancelled: true };
    } finally {
        for (const ui of scopes) ui.dispose();
        await Promise.all(scopes.map(ui => ui.waitForPendingLoads()));
        roots.forEach(root => root.destroy());
        for (const route of routes) await lx.ui.unregisterView(route);
    }
}
