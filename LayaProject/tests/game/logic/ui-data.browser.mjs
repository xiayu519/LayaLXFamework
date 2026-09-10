/** Drives the account example through authored native buttons; no service is exposed to the probe. */
export default function uiDataProbe() {
    return `(${verifyUIData.toString()})()`;
}

async function verifyUIData() {
    const { lx, Laya } = globalThis;
    const started = performance.now();
    const inventoryId = "lx.examples.inventory", confirmationId = "lx.examples.confirm";
    const key = "examples/inventory";
    const store = lx.ui.redDots;
    const assert = (condition, message) => {
        if (!condition) throw new Error(`UI data: ${message}`);
    };
    const wait = async (predicate, label, timeout = 2000) => {
        const until = performance.now() + timeout;
        while (!predicate()) {
            assert(performance.now() < until, `timed out waiting for ${label}`);
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    };
    const bounded = async (operation, label, timeout = 2000) => {
        let timer;
        try {
            return await Promise.race([operation, new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`UI data: timed out during ${label}`)), timeout);
            })]);
        } finally { clearTimeout(timer); }
    };
    const frame = () => new Promise(resolve => Laya.timer.frameOnce(1, {}, resolve));
    const scope = () => lx.sceneFlow.current.ui;
    const find = (id, visibleOnly = true) => scope().snapshot().views
        .find(entry => entry.routeId === id && (!visibleOnly || entry.visible))?.view;
    const countText = view => view.inventoryBadgeCount.text;
    const totalText = (view, quantity) => view.summaryText.text.includes(`共 ${quantity} 件`);
    const statusTotal = (view, quantity) => view.inventoryText.text.includes(`共 ${quantity} 件`);
    const click = button => {
        // Native auto input can report mouseEnabled=false while dispatching button events normally.
        assert(button && !button.destroyed && !button.grayed, "button must be live and enabled");
        const point = Laya.SpriteUtils.getTransformRelativeToWindow(button, button.width / 2, button.height / 2);
        const canvas = document.querySelector("canvas");
        for (const type of ["mousemove", "mousedown", "mouseup"]) {
            canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: point.x, clientY: point.y,
                button: 0, buttons: type === "mousedown" ? 1 : 0 }));
        }
    };
    const openInventory = async () => {
        const status = find("lx.status");
        assert(status, "status page is not available");
        click(status.examplesButton);
        await wait(() => find(inventoryId)?.itemList.numChildren > 0, "inventory and virtual rows");
        return find(inventoryId);
    };
    const closeInventory = async inventory => {
        click(inventory.frame.getChild("closeButton"));
        await wait(() => !inventory.parent && find("lx.status")?.active, "return to status");
        assert(!inventory.destroyed, "inventory must retain only its view state while hidden");
    };
    const openConfirmation = async inventory => {
        click(inventory.useButton);
        await wait(() => find(confirmationId)?.mouseEnabled, "confirmation opening animation");
        return find(confirmationId);
    };
    const choose = async (inventory, index) => {
        const list = inventory.itemList;
        list.scroller.scrollTo(index, false);
        await wait(() => {
            const childIndex = list.itemIndexToChildIndex(index);
            return childIndex >= 0 && list.getChildAt(childIndex).itemId === `supply-${index + 1}`;
        }, `virtual row ${index}`);
        const row = list.getChildAt(list.itemIndexToChildIndex(index));
        assert(row.itemId === `supply-${index + 1}`, "virtual row did not render the requested item");
        click(row);
        assert(inventory.selectedItemId === row.itemId && list.selection.index === index,
            "selection did not stay with the native view");
    };
    const observerId = `__ui_data_observer_${Math.floor(started)}`;
    let observer;
    let rewardElapsedMs = 0;
    let cleanupReady = false;
    try {
        // Earlier integration stages may have left retained example pages.
        for (const entry of [...scope().snapshot().views]) {
            if (entry.routeId.startsWith("lx.examples.")) entry.view.destroy();
        }
        const status = find("lx.status");
        assert(status && status.active, "native status page is missing");
        let inventory = await openInventory();
        cleanupReady = true;
        click(inventory.resetButton);
        await wait(() => store.get(key) === 300 && totalText(inventory, 300)
            && countText(inventory) === "300", "explicit initial reset");
        await closeInventory(inventory);
        await wait(() => statusTotal(status, 300) && countText(status) === "300", "status reads reset data");

        // A second visible Runtime observes the same path without gaining access to the service.
        const observerRoute = lx.ui.registerView({ id: observerId,
            url: "bootstrap/game/ui/FrameworkStatus.lh", viewType: status.constructor,
            layout: "fullscreen", navigation: "overlay", modal: false, retention: "destroy",
            bind(view, _args, session) {
                view.mouseEnabled = false;
                view.getChild("full").visible = false;
                view.alpha = 0.25;
                session.bindRedDot(view.inventoryBadge, key, { countText: view.inventoryBadgeCount, maxCount: 999 });
            },
        });
        observer = await bounded(scope().show(observerRoute, undefined), "badge observer opening");
        assert(observer.active && status.active && observer.parent === status.parent
            && countText(observer) === "300", "two independent visible badge owners were not bound");

        const rewardStarted = performance.now();
        click(status.rewardButton);
        await wait(() => !status.rewardButton.mouseEnabled && status.feedbackText.text.includes("6 秒"),
            "reward request feedback");
        inventory = await openInventory();
        assert(!status.active && inventory.active, "covered status page did not pause");
        await closeInventory(inventory);
        const closedSummary = inventory.summaryText.text;
        const closedBadge = countText(inventory);
        await wait(() => store.get(key) === 305 && statusTotal(status, 305)
            && countText(status) === "305" && countText(observer) === "305"
            && status.feedbackText.text.includes("奖励已到账"), "reward delivered while inventory is closed", 6500);
        rewardElapsedMs = Math.round(performance.now() - rewardStarted);
        assert(!inventory.parent && !inventory.destroyed && inventory.summaryText.text === closedSummary
            && countText(inventory) === closedBadge, "closed cached view continued rendering data notifications");
        assert(status.active && observer.active && observer.inventoryBadge.visible && status.inventoryBadge.visible,
            "same-key visible bindings did not stay independent");
        scope().close(observerId, observer);
        assert(observer.destroyed, "observer presentation was not cleaned up");

        const cached = inventory;
        inventory = await openInventory();
        assert(inventory === cached && totalText(inventory, 305) && countText(inventory) === "305"
            && inventory.selectionText.text.includes("剩余 8 件"), "reopening did not read the latest account snapshot");
        await choose(inventory, 1);
        assert(store.get(key) === 305 && countText(inventory) === "305", "selection changed the business badge rule");
        await choose(inventory, 0);

        const confirmation = await openConfirmation(inventory);
        assert(confirmation instanceof Laya.GWidget && !(confirmation instanceof Laya.GWindow)
            && confirmation.parent === scope().root, "confirmation is not a native scene-owned view");
        click(confirmation.confirmButton);
        assert(store.get(key) === 304 && totalText(inventory, 305),
            "confirmation must commit business data before the deferred view render");
        await wait(() => totalText(inventory, 304) && countText(inventory) === "304"
            && inventory.selectionText.text.includes("剩余 7 件"), "confirmation binding update");
        assert(!status.active && statusTotal(status, 305) && countText(status) === "305",
            "covered status page kept rendering instead of pausing its bindings");
        await wait(() => confirmation.destroyed, "confirmation close animation");
        await closeInventory(inventory);
        assert(statusTotal(status, 304) && countText(status) === "304", "resumed status did not read current data");

        click(status.snapshotButton);
        await wait(() => store.get(key) === 305 && statusTotal(status, 305)
            && status.feedbackText.text.includes("重新领取"), "full snapshot rebuild");
        click(status.replayButton);
        await wait(() => status.feedbackText.text.includes("已忽略"), "stale packet feedback");
        assert(store.get(key) === 305 && statusTotal(status, 305) && countText(status) === "305",
            "an old response overwrote the reconstructed snapshot");
        inventory = await openInventory();
        assert(inventory.itemList.numItems === 100 && inventory.selectionText.text.includes("剩余 8 件"),
            "snapshot did not reconstruct the current inventory");
        await choose(inventory, 29);
        assert(store.get(key) === 305, "choosing a distant virtual row changed account state");
        await closeInventory(inventory);
        assert(await openInventory() === inventory && inventory.selectedItemId === "supply-30"
            && inventory.itemList.itemIndexToChildIndex(29) >= 0, "hidden page lost selection or scroll position");

        const oldScene = lx.sceneFlow.current, oldScope = oldScene.ui;
        const child = await openConfirmation(inventory);
        const oldButton = child.confirmButton, oldMask = oldScope.modalLayer;
        assert(oldMask?.parent === oldScope.root, "scene-local popup mask is missing");
        await bounded(lx.sceneFlow.open("lx.examples.scene", {
            status: "READY", detail: "旅行补给站\n补给、奖励与背包随时同步",
        }), "scene replacement");
        assert(oldScene.destroyed && oldScope.root.destroyed && status.destroyed && inventory.destroyed
            && child.destroyed && oldButton.destroyed && oldMask.destroyed
            && oldScope.snapshot().views.length === 0, "scene exit left an old native view or child confirmation alive");
        const freshStatus = find("lx.status");
        assert(freshStatus && statusTotal(freshStatus, 305) && countText(freshStatus) === "305",
            "scene replacement reset application-owned account data");
        oldButton.event(Laya.Event.CLICK);
        await frame();
        assert(store.get(key) === 305 && !find(confirmationId, false),
            "an old confirmation callback affected the new scene");
        inventory = await openInventory();
        assert(inventory !== cached && inventory.selectionText.text.includes("剩余 8 件")
            && totalText(inventory, 305), "new scene view did not reconstruct from retained account data");
        return { passed: true, rewardElapsedMs, quantities: [300, 305, 304, 305],
            closedViewPaused: true, reopenedSnapshot: true, independentBadges: true,
            coveredViewResumed: true, modelBeforeRender: true, snapshotRebuilt: true,
            staleResponseIgnored: true, selectionAndScrollRetained: true,
            accountSurvivesScene: true, oldSceneViewsDestroyed: true, staleChildCancelled: true };
    } finally {
        if (observer && !observer.destroyed) observer.destroy();
        const currentScope = lx.sceneFlow.current?.ui;
        if (currentScope && !currentScope.snapshot().disposed) {
            for (const entry of [...currentScope.snapshot().views]) {
                if (entry.routeId !== "lx.status" && entry.routeId !== inventoryId) entry.view.destroy();
            }
            if (cleanupReady) {
                const existing = currentScope.snapshot().views.find(entry => entry.routeId === inventoryId && entry.visible)?.view;
                const cleanupInventory = existing ?? await currentScope.show(inventoryId, { title: "旅行背包" });
                // Native button cleanup also cancels a pending simulated reward after a failed assertion.
                cleanupInventory.resetButton.fireClick();
                cleanupInventory.destroy();
                await frame();
                assert(store.get(key) === 300, "cleanup failed to reset the example account");
            }
        }
    }
}
