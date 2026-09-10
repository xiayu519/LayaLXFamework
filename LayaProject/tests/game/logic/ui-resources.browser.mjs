export default function uiResourcesProbe() {
    return `(${verifyUIResources.toString()})()`;
}

async function verifyUIResources() {
    const { Laya, lx } = globalThis;
    const assert = (value, message) => { if (!value) throw new Error(`UI resources: ${message}`); };
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const frame = () => new Promise(resolve => Laya.timer.frameOnce(1, {}, resolve));
    const wait = async (predicate, message) => {
        const end = performance.now() + 4500;
        while (!predicate()) { assert(performance.now() < end, message); await delay(10); }
    };
    const collect = async () => { await wait(() => !Laya.loader.loading, "loader did not settle"); await frame(); Laya.Scene.gc(); await frame(); await frame(); await delay(80); };
    const createItem = async () => (await Laya.loader.load("bootstrap/ui/examples/components/UIInventoryItem.lh", Laya.Loader.HIERARCHY)).create();
    const createList = async () => (await Laya.loader.load("bootstrap/ui/examples/UIInventory.lh", Laya.Loader.HIERARCHY)).create();
    const owned = new Set();
    const own = node => { owned.add(node); return node; };
    const dispose = node => { if (!node.destroyed) node.destroy(); owned.delete(node); };
    const atlases = async id => {
        const [a, b] = await Promise.all(["a", "b"].map(kind => Laya.loader.load(`__lx_resource_${kind}.atlas?case=${id}`, Laya.Loader.ATLAS)));
        const urlA = `__lx_resource_icons/${id}/a/icon.png`, urlB = `__lx_resource_icons/${id}/b/icon.png`;
        const ta = Laya.loader.getRes(urlA), tb = Laya.loader.getRes(urlB);
        assert(ta instanceof Laya.Texture && tb instanceof Laya.Texture, "atlas subtextures missing");
        return { a, b, ta, tb, urlA, urlB, bitmapA: ta.bitmap, bitmapB: tb.bitmap, pageA:a.textures[0],pageB:b.textures[0] };
    };
    const results = [];
    try {
        // Already displayed images, shared owners, nested destruction, button icons and nine-grid commands.
        for (const mode of ["plain", "button", "nine-grid", "animation"]) {
            const asset = await atlases(mode), row = own(await createItem()), image = row.itemImage;
            assert(image instanceof Laya.GLoader && image.constructor !== Laya.GLoader, "UIDynamicImage Runtime not assigned");
            Laya.stage.addChild(row);
            const keeper = own(new Laya.Sprite()); keeper.graphics.drawTexture(asset.ta, 0, 0, 1, 1);
            Laya.stage.addChild(keeper);
            if (mode === "nine-grid") image.sizeGrid = "0,0,0,0";
            if (mode === "button") row.iconWidget = image;
            const set = url => { if (mode === "button") row.icon = url; else image.src = url; };
            const urlA = mode === "animation" ? `__lx_resource_a.atlas?case=${mode}` : asset.urlA;
            const urlB = mode === "animation" ? `__lx_resource_b.atlas?case=${mode}` : asset.urlB;
            set(urlA); await frame();
            for (let i = 0; i < 20; i++) { set(i % 2 === 0 ? urlB : urlA); await frame(); }
            set(urlB); await frame();
            assert(asset.a.referenceCount === 1 && asset.b.referenceCount === 1, `${mode}: references drift after replacement (${asset.a.referenceCount}/${asset.b.referenceCount})`);
            dispose(row); image.destroy(); // Calling destroy again must not release a recovered graphics command twice.
            await frame(); // FrameAnimation component destruction is completed by the native component driver.
            assert(asset.a.referenceCount === 1 && asset.b.referenceCount === 0, `${mode}: nested destroy did not balance references`);
            await collect();
            assert(!asset.a.destroyed && !asset.bitmapA.destroyed && asset.b.destroyed && asset.bitmapB.destroyed,
                `${mode}: GC state ${JSON.stringify({a:asset.a.destroyed,b:asset.b.destroyed,bitmapA:asset.bitmapA.destroyed,bitmapB:asset.bitmapB.destroyed,refA:asset.a.referenceCount,refB:asset.b.referenceCount,bitmapRefA:asset.bitmapA.referenceCount,bitmapRefB:asset.bitmapB.referenceCount,lockA:asset.a.lock,lockB:asset.b.lock,ta:asset.ta.referenceCount,tb:asset.tb.referenceCount,taDestroyed:asset.ta.destroyed,tbDestroyed:asset.tb.destroyed,pageA:asset.pageA.referenceCount,pageB:asset.pageB.referenceCount,pageBDestroyed:asset.pageB.destroyed,sameBitmap:asset.bitmapA===asset.bitmapB})}`);
            dispose(keeper); await collect();
            assert(asset.a.destroyed && asset.bitmapA.destroyed, `${mode}: final shared owner release leaked its atlas`);
            results.push(mode);
        }

        // Native virtual and loop lists reuse actual prefab rows with nested dynamic images.
        for (const loop of [false, true]) {
            for (let cycle = 0; cycle < 3; cycle++) {
                const asset = await atlases(`list-${loop}-${cycle}`), view = own(await createList());
                Laya.stage.addChild(view);
                lx.ui.layout.applyView(view, "fullscreen");
                const list = view.itemList; let revision = 0;
                const rows = new Set();
                list.itemRenderer = (index, row) => {
                    rows.add(row);
                    row.itemImage.src = (index + revision) % 2 ? asset.urlA : asset.urlB;
                };
                if (loop) list.setVirtualAndLoop(); else list.setVirtual();
                list.numItems = 100;
                for (let i = 0; i < 24; i++) {
                    revision++;
                    list.scroller.scrollTo((i * 7) % 100, false);
                    list.refreshVirtualList(); await frame();
                    assert(asset.a.referenceCount >= 0 && asset.b.referenceCount >= 0, "list produced negative atlas references");
                }
                assert(rows.size < 100, "list stopped reusing native rows");
                dispose(view);
                assert(asset.a.referenceCount === 0 && asset.b.referenceCount === 0, `list ${loop}: pooled rows kept atlas references`);
                await collect();
                assert(asset.a.destroyed && asset.b.destroyed && asset.bitmapA.destroyed && asset.bitmapB.destroyed, "list atlas bitmaps survived owner destruction");
            }
            results.push(loop ? "loop-list" : "virtual-list");
        }

        // A cancelled pool waiter does not instantiate a late prefab or cancel another consumer's load.
        const poolId = "__ui_resource_pool", url = "__lx_resource_prefab.lh?case=pool&slow=1";
        let created = 0;
        lx.pool.register({ id: poolId, url, maxIdle: 1, create(prefab) { created++; return prefab.create(); } });
        const abort = new AbortController();
        const cancelled = lx.pool.acquire(poolId, { signal: abort.signal }).then(() => false, () => true);
        const remaining = lx.pool.acquire(poolId);
        abort.abort(); assert(await cancelled, "pool owner cancellation did not reject");
        const node = await remaining;
        assert(created === 1 && !node.destroyed, "pool cancellation affected shared consumer or created a late node");
        lx.pool.release(poolId, node); lx.pool.drain(poolId);
        await collect(); assert(node.destroyed, "pool drain did not destroy native instance");
        assert(lx.pool.snapshot().find(p => p.id === poolId).pending === 0, "pool pending capacity leaked");
        results.push("cancelled-shared-pool-load");

        // Native src load is still pending when a nested owner is destroyed.
        const lateRow = own(await createItem()), lateUrl = "__lx_probe_slow.png?case=destroyed-image";
        lateRow.itemImage.src = lateUrl;
        const lateTexture = Laya.loader.load(lateUrl, Laya.Loader.IMAGE);
        dispose(lateRow);
        const loaded = await lateTexture;
        assert(loaded.referenceCount === 0, "late image attached to its destroyed owner");
        const bitmap = loaded.bitmap; await collect();
        assert(bitmap.destroyed, "late image bitmap was never collected");
        results.push("late-image-destruction");

        // Row identity changes while the first native request is still in flight.
        const reused = own(await createItem()); Laya.stage.addChild(reused);
        const slowUrl = "__lx_probe_slow.png?case=reused-row";
        const stale = Laya.loader.load(slowUrl, Laya.Loader.IMAGE);
        reused.itemImage.src = slowUrl;
        const freshUrl = "__lx_probe_fast.png?case=reused-row";
        reused.itemImage.src = freshUrl;
        const fresh = await Laya.loader.load(freshUrl, Laya.Loader.IMAGE);
        const staleTexture = await stale; await frame();
        assert(reused.itemImage.src === freshUrl && fresh.referenceCount > 0 && staleTexture.referenceCount === 0,
            "a late row image replaced its new identity");
        const staleBitmap = staleTexture.bitmap, freshBitmap = fresh.bitmap;
        dispose(reused); await collect();
        assert(staleBitmap.destroyed && freshBitmap.destroyed, "reused row left pending image bitmaps");
        results.push("late-row-replacement");

        const atlasRow = own(await createItem());
        const lateAtlasUrl = "__lx_resource_a.atlas?case=late-animation&slow=1";
        atlasRow.itemImage.src = lateAtlasUrl;
        const atlasLoading = Laya.loader.load(lateAtlasUrl, Laya.Loader.ATLAS);
        dispose(atlasRow);
        const lateAtlas = await atlasLoading, lateAtlasBitmap = lateAtlas.textures[0].bitmap;
        await collect();
        assert(lateAtlas.destroyed && lateAtlasBitmap.destroyed, "late atlas animation survived its destroyed owner");
        results.push("late-atlas-destruction");

        // Close during an async binder, after its native prefab has already been created.
        const bindingScope = lx.scenes.get('examples.lobby').ui;
        let entered = false, wrote = false, cleaned = 0, loadedAtlas;
        const bindingRoute = lx.ui.registerView({ id: "__ui_resource_binding", url: "__lx_resource_prefab.lh?case=binder&ui=1",
            async bind(view, args, session) {
                session.lifetime.defer(() => { cleaned++; });
                entered = true;
                loadedAtlas = await Laya.loader.load("__lx_resource_b.atlas?case=late-bind&slow=1", Laya.Loader.ATLAS);
                if (!session.token.isCurrent()) return;
                wrote = true; view.name = "Invalid late write";
            } });
        const binding = bindingScope.show(bindingRoute, undefined).then(() => false, () => true);
        await wait(() => entered, "async binder never started");
        bindingScope.close(bindingRoute.id);
        assert(await binding, "closing did not cancel pending binding");
        await bindingScope.waitForPendingLoads();
        const bindingBitmap = loadedAtlas.textures[0].bitmap; await collect();
        assert(!wrote && cleaned === 1 && loadedAtlas.destroyed && bindingBitmap.destroyed,
            "closing during async binding leaked resources or ran a late write");
        results.push("close-during-async-binding");

        // Keep the application alive while destroying a scene with a pending prefab UI and pool acquisition.
        const old = lx.scenes.get('examples.lobby'), scope = old.ui;
        const scenePoolId = "__ui_resource_scene_pool";
        let lateCreates = 0;
        lx.pool.register({ id: scenePoolId, url: "__lx_resource_prefab.lh?case=scene-pool&slow=1", maxIdle: 0,
            create(prefab) { lateCreates++; return prefab.create(); } });
        const acquisition = lx.pool.acquire(scenePoolId, { signal: old.signal }).then(() => false, () => true);
        const lateRoute = lx.ui.registerView({ id: "__ui_resource_late_view",
            url: "__lx_resource_prefab.lh?case=scene-view&slow=1&ui=1",
            bind() { throw new Error("cancelled UI must never bind"); } });
        const opening = scope.show(lateRoute, undefined).then(() => false, () => true);
        const next = await lx.scenes.open("examples.lobby", { status: "READY", detail: "Async resource regression" });
        assert(old.signal.aborted && old.destroyed && next !== old, "scene lifetime did not cancel");
        assert(await opening && await acquisition && lateCreates === 0, "late scene work created an instance");
        await lx.pool.waitForPendingLoads(); await collect();
        assert(scope.snapshot().views.length === 0, "disposed scene retained UI records");
        results.push("scene-exit-with-pending-work");
        return { passed: true, cases: results, listCycles: 6, listRefreshes: 144 };
    } finally {
        for (const node of owned) if (!node.destroyed) node.destroy();
        await lx.ui.unregisterView("__ui_resource_binding");
        await lx.ui.unregisterView("__ui_resource_late_view");
    }
}
