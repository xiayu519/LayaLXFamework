/** 通过真实按钮验证 World 注册项清理；账号查询始终独立于两个 World。 */
export default function uiWorldsProbe() {
    return `(${verifyUIWorlds.toString()})()`;
}

async function verifyUIWorlds() {
    const { lx, Laya } = globalThis;
    const assert = (condition, message) => { if (!condition) throw new Error(`World UI: ${message}`); };
    const frame = () => new Promise(resolve => Laya.timer.frameOnce(1, {}, resolve));
    const wait = async (predicate, message, timeout = 4000) => {
        const deadline = performance.now() + timeout;
        while (!predicate()) {
            assert(performance.now() < deadline, message);
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    };
    const click = button => {
        assert(button && !button.destroyed && !button.grayed && button.activeInHierarchy, "button is not interactive");
        const point = Laya.SpriteUtils.getTransformRelativeToWindow(button, button.width / 2, button.height / 2);
        for (const type of ["mousemove", "mousedown", "mouseup"]) {
            document.querySelector("canvas").dispatchEvent(new MouseEvent(type, { bubbles: true,
                clientX: point.x, clientY: point.y, button: 0, buttons: type === "mousedown" ? 1 : 0 }));
        }
    };
    const find = (scene, id) => scene?.ui.snapshot().views.find(entry => entry.routeId === id && entry.visible)?.view;
    const lobbyView = () => find(lx.scenes.get("examples.lobby"), "lx.status");
    const battleView = () => find(lx.scenes.get("examples.battle"), "lx.examples.battle");
    const account = lx.data.get({ id: "examples.inventory" });
    const openInventory = async status => {
        click(status.examplesButton);
        await wait(() => find(lx.scenes.get("examples.lobby"), "lx.examples.inventory")?.itemList.numChildren > 0,
            "inventory did not open through its native button");
        return find(lx.scenes.get("examples.lobby"), "lx.examples.inventory");
    };
    const closeInventory = async inventory => {
        click(inventory.frame.getChild("closeButton"));
        await wait(() => !inventory.parent && lobbyView()?.active, "inventory did not return to the lobby");
        assert(!inventory.destroyed, "the authored inventory cache policy was ignored");
    };
    const missingRoute = async (scope, id) => {
        let rejected = false;
        try { await scope.show(id, {}); }
        catch (error) { rejected = String(error).includes("Unknown native UI route"); }
        assert(rejected, `exited World's UI registration survived: ${id}`);
    };

    let rewardElapsedMs = 0;
    await wait(() => lx.worlds.get("examples.lobby") && lobbyView(), "initial lobby World is not ready");
    let inventory = await openInventory(lobbyView());
    click(inventory.resetButton);
    await wait(() => account.totalQuantity === 300, "initial account reset did not commit");
    await closeInventory(inventory);

    for (let cycle = 0; cycle < 4; cycle++) {
        const lobby = lx.scenes.get("examples.lobby"), oldScope = lobby.ui;
        const oldWorld = lx.worlds.get("examples.lobby"), status = lobbyView();
        assert(oldWorld.events instanceof Laya.EventDispatcher && typeof oldWorld.registerScene === "function",
            "World is missing native events or automatic registration ownership");
        assert(oldWorld.events.hasListener("lobby:enter-battle")
            && !lx.events.hasListener("lobby:enter-battle") && !lx.events.hasListener("battle:return-lobby"),
            "World navigation events were registered on the root dispatcher");
        lx.events.event("lobby:enter-battle");
        await frame();
        assert(lx.worlds.get("examples.lobby") === oldWorld, "root event entered a child-only request handler");
        const oldViews = oldScope.snapshot().views.map(entry => entry.view);
        assert(oldViews.some(view => !view.parent && !view.destroyed), "lobby must contain a retained UI before exiting");
        const rewardStarted = performance.now();
        if (cycle === 0) {
            click(status.rewardButton);
            await wait(() => status.rewardButton.grayed, "reward request was not accepted");
        }
        const staleLobbyButton = status.battleButton;
        click(staleLobbyButton);
        await wait(() => lx.worlds.get("examples.battle") && battleView(), `battle World ${cycle} did not initialize`);
        const battle = lx.scenes.get("examples.battle");
        let battlePage = battleView();
        assert(oldWorld.signal.aborted && !lx.worlds.get("examples.lobby") && !lx.scenes.get("examples.lobby"),
            `lobby World ${cycle} or Scene remained registered`);
        assert(lobby.destroyed && oldScope.root.destroyed && oldScope.snapshot().views.length === 0
            && oldViews.every(view => view.destroyed), `lobby World ${cycle} leaked visible or cached UI`);
        assert(lx.data.get({ id: "examples.inventory" }) === account, "World switching replaced the account data module");
        assert(lx.scenes.snapshot().registeredRoutes.join(",") === "examples.battle", "lobby Scene registration was not removed");
        await missingRoute(battle.ui, "lx.status");
        staleLobbyButton.event(Laya.Event.CLICK);
        assert(!oldWorld.events.hasListener("lobby:enter-battle"), "exited lobby retained its local listener");
        oldWorld.events.event("lobby:enter-battle");
        await frame();
        assert(lx.scenes.get("examples.battle") === battle, "a destroyed lobby button still switched Worlds");
        if (cycle === 0) {
            await wait(() => account.totalQuantity === 305 && battlePage.counterText.text.includes("共 305 件"),
                "account reward was lost while its lobby World was absent", 6500);
            rewardElapsedMs = Math.round(performance.now() - rewardStarted);
        }
        assert(account.totalQuantity === 305 && battlePage.counterText.text.includes("共 305 件"),
            "Battle UI did not read the shared account snapshot");
        assert(lx.ui.redDots.get("examples/inventory") === 305,
            "account badge updates still depend on the lobby World");
        const battleInventory = await battle.ui.show("lx.examples.inventory", { title: "Battle supplies" });
        assert(battleInventory.parent === battle.ui.root && battleInventory.summaryText.text.includes("共 305 件"),
            "shared inventory definition was removed with the lobby World");
        battle.ui.close("lx.examples.inventory", battleInventory);
        assert(battlePage.destroyed, "replacing inventory kept the old battle page");
        battlePage = await battle.ui.show("lx.examples.battle", { status: "BATTLE", detail: "Battle resumed" });
        await wait(() => !battleInventory.parent && battlePage.active, "shared inventory did not close in battle");
        const oldBattleWorld = lx.worlds.get("examples.battle"), battleScope = battle.ui;
        assert(oldBattleWorld.events.hasListener("battle:return-lobby")
            && !oldBattleWorld.events.hasListener("lobby:enter-battle"), "battle uses another World's event registration");
        const staleBattleButton = battlePage.actionButton;
        click(staleBattleButton);
        await wait(() => lx.worlds.get("examples.lobby") && lobbyView(), `lobby World ${cycle} did not reinitialize`);
        assert(oldBattleWorld.signal.aborted && !lx.worlds.get("examples.battle") && !lx.scenes.get("examples.battle"),
            `battle World ${cycle} or Scene survived exit`);
        assert(battle.destroyed && battleScope.root.destroyed && battlePage.destroyed && battleScope.snapshot().views.length === 0,
            `battle World ${cycle} leaked UI`);
        assert(battleInventory.destroyed, "battle exit did not release its shared inventory instance");
        assert(lx.scenes.snapshot().registeredRoutes.join(",") === "examples.lobby", "battle Scene registration was not removed");
        await missingRoute(lx.scenes.get("examples.lobby").ui, "lx.examples.battle");
        await wait(() => lobbyView().inventoryText.text.includes("共 305 件")
            && lobbyView().inventoryBadgeCount.text === "305", "new lobby did not restore account data and badge subscriptions");
        const freshLobby = lx.scenes.get("examples.lobby");
        staleBattleButton.event(Laya.Event.CLICK);
        assert(!oldBattleWorld.events.hasListener("battle:return-lobby"), "exited battle retained its local listener");
        oldBattleWorld.events.event("battle:return-lobby");
        await frame();
        assert(lx.scenes.get("examples.lobby") === freshLobby, "a destroyed battle button still switched Worlds");
        await lx.ui.waitForPendingLoads();
        assert(lx.ui.snapshot().scenes.length === 1, `World cycle ${cycle} accumulated Scene UI hosts`);
        assert(lx.worlds.snapshot().worlds.length === 1 && lx.worlds.snapshot().cleanupFailures === 0,
            `World cycle ${cycle} retained exited scopes or cleanup failures`);
        inventory = await openInventory(lobbyView());
        assert(inventory.summaryText.text.includes("共 305 件"), "recreated inventory did not read preserved data");
        await closeInventory(inventory);
    }

    inventory = await openInventory(lobbyView());
    click(inventory.resetButton);
    await wait(() => account.totalQuantity === 300, "final account reset failed");
    await closeInventory(inventory);

    // 多个 World 可独立进入并共存；UI 始终由各自原始 Scene 明确持有。
    const keptWorld = lx.worlds.get("examples.lobby"), keptScene = lx.scenes.get("examples.lobby");
    const keptStatus = lobbyView(), keptScope = keptScene.ui;
    await lx.worlds.enter("examples.battle");
    await wait(() => lx.worlds.get("examples.battle") && battleView(), "coexisting battle World did not initialize");
    const concurrentBattle = lx.scenes.get("examples.battle"), concurrentPage = battleView();
    assert(lx.worlds.get("examples.lobby") === keptWorld && lx.scenes.get("examples.lobby") === keptScene
        && !keptWorld.signal.aborted && !keptScene.destroyed && keptStatus.parent === keptScope.root,
        "entering another World replaced the existing lobby owner");
    assert(lx.worlds.snapshot().worlds.length === 2 && lx.scenes.snapshot().registeredRoutes.length === 2,
        "independent World/Scene registrations did not coexist");
    assert(keptScope.root !== concurrentBattle.ui.root && concurrentPage.parent === concurrentBattle.ui.root
        && !("ui" in lx.worlds.get("examples.battle")), "coexisting UI ownership escaped its Scene");
    const args = { title: "Shared confirmation", message: "Each scene owns its own instance", confirmText: "Confirm", onConfirm() {} };
    const lobbyDialog = await keptScene.ui.show("lx.examples.confirm", args);
    const battleDialog = await concurrentBattle.ui.show("lx.examples.confirm", args);
    assert(lobbyDialog !== battleDialog && lobbyDialog.parent === keptScope.root
        && battleDialog.parent === concurrentBattle.ui.root, "shared route reused another Scene's UI instance");
    await lx.worlds.exit("examples.battle");
    assert(battleDialog.destroyed && !lobbyDialog.destroyed && lobbyDialog.parent === keptScope.root,
        "World teardown crossed the shared route's Scene ownership boundary");
    keptScene.ui.close("lx.examples.confirm", lobbyDialog);
    await wait(() => lobbyDialog.destroyed && keptStatus.active, "surviving shared dialog did not close");
    assert(concurrentBattle.destroyed && concurrentPage.destroyed && !lx.scenes.get("examples.battle"),
        "exiting the coexisting battle did not release its own Scene/UI");
    assert(lx.worlds.get("examples.lobby") === keptWorld && lx.scenes.get("examples.lobby") === keptScene
        && lobbyView() === keptStatus && !keptStatus.destroyed && !inventory.destroyed,
        "exiting another World destroyed or recreated the lobby Scene/UI/cache");
    click(keptStatus.snapshotButton);
    await wait(() => account.totalQuantity === 305 && keptStatus.inventoryText.text.includes("共 305 件")
        && keptStatus.inventoryBadgeCount.text === "305", "surviving lobby lost its native data event subscriptions");
    await lx.ui.waitForPendingLoads();
    assert(lx.ui.snapshot().scenes.length === 1 && lx.worlds.snapshot().worlds.length === 1,
        "coexisting World teardown left an extra UI scope or World");
    inventory = await openInventory(keptStatus);
    click(inventory.resetButton);
    await wait(() => account.totalQuantity === 300, "coexistence cleanup did not reset account data");
    await closeInventory(inventory);
    return { passed: true, worldCycles: 4, rewardElapsedMs, accountPreserved: true,
        closedWorldRewardDelivered: true, nativeButtonNavigation: true, worldUIRegistrationsRemoved: true,
        commonUIRegistrationsPreserved: true, commonInstancesSceneOwned: true, globalBadgesWithoutLobby: true,
        sceneRegistrationsRemoved: true, cachedViewsDestroyed: true, staleButtonsDetached: true,
        concurrentWorlds: true, survivingSceneIdentity: true, survivingNativeSubscriptions: true,
        worldLocalNavigationEvents: true, rootEventIsolation: true, exitedLocalListenersRemoved: true };
}
