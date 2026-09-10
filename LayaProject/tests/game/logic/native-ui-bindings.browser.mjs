/** Verifies authored scripts and native Runtime field assignment, including nested prefab variables. */
export default function nativeUIBindingsProbe() {
    return `(${verifyNativeUIBindings.toString()})()`;
}

async function verifyNativeUIBindings() {
    const { lx, Laya } = globalThis;
    const assert = (condition, message) => {
        if (!condition) throw new Error(`Native UI bindings: ${message}`);
    };
    // Published class IDs are compressed by the IDE; read its output instead of using source UUIDs.
    const authored = await (await fetch("bootstrap/ui/UISceneLoading.lh")).json();
    const Lifecycle = Laya.ClassUtils.getClass(authored._$comp[0]._$type);
    assert(typeof Lifecycle === "function", "authored lifecycle script was not registered");
    const settingsByAsset = {
        UISceneLoading: { layout: "fullscreen", layer: 6, navigation: "overlay", modal: true, closeOnMaskClick: false, multiplicity: "singleton", retention: "hide" },
        UILobby: { layout: "fullscreen", layer: 1, navigation: "page", modal: false, closeOnMaskClick: true, multiplicity: "singleton", retention: "destroy" },
        UIConfirmation: { layout: "center-popup", layer: 3, navigation: "overlay", modal: true, closeOnMaskClick: true, multiplicity: "multiple", retention: "destroy" },
        UIInventory: { layout: "fullscreen", layer: 1, navigation: "page", modal: false, closeOnMaskClick: true, multiplicity: "singleton", retention: "hide" },
        UIFullscreenMid: { layout: "fullscreen", layer: 1, navigation: "page", modal: false, closeOnMaskClick: true, multiplicity: "singleton", retention: "destroy" },
        UIBattle: { layout: "fullscreen", layer: 1, navigation: "page", modal: false, closeOnMaskClick: true, multiplicity: "singleton", retention: "destroy" },
    };
    const definitions = [
        { asset: "UISceneLoading", url: "bootstrap/ui/UISceneLoading.lh", fields: {
            phaseText: Laya.GTextField, sceneProgressText: Laya.GTextField,
            resourceProgressText: Laya.GTextField, percentText: Laya.GTextField,
            progressFill: Laya.GWidget,
        } },
        { asset: "UILobby", url: "bootstrap/ui/examples/UILobby.lh", fields: {
            statusText: Laya.GTextField, detailText: Laya.GTextField, examplesButton: Laya.GButton, battleButton: Laya.GButton,
            inventoryText: Laya.GTextField, feedbackText: Laya.GTextField, rewardButton: Laya.GButton,
            snapshotButton: Laya.GButton, replayButton: Laya.GButton, inventoryBadge: Laya.GWidget, inventoryBadgeCount: Laya.GTextField,
        } },
        { asset: "UIConfirmation", fields: {
            frame: Laya.GLabel, messageText: Laya.GTextField,
            cancelButton: Laya.GButton, confirmButton: Laya.GButton,
        } },
        { asset: "UIInventory", fields: {
            frame: Laya.GLabel, summaryText: Laya.GTextField, midExampleButton: Laya.GButton,
            itemList: Laya.GList, selectionText: Laya.GTextField,
            resetButton: Laya.GButton, useButton: Laya.GButton, inventoryBadge: Laya.GWidget, inventoryBadgeCount: Laya.GTextField,
        } },
        { asset: "UIFullscreenMid", fields: {
            frame: Laya.GLabel, counterText: Laya.GTextField, actionButton: Laya.GButton,
        } },
        { asset: "UIBattle", fields: {
            frame: Laya.GLabel, counterText: Laya.GTextField, actionButton: Laya.GButton,
        } },
        { asset: "UIInventoryItem", url: "bootstrap/ui/examples/components/UIInventoryItem.lh", fields: {
            indexText: Laya.GTextField, quantityText: Laya.GTextField, itemImage: Laya.GLoader,
        } },
    ];
    let checked = 0, staticScripts = 0;
    await Laya.loader.load(["bootstrap/ui/examples/icons/supplies.atlas", "bootstrap/ui/examples/icons/equipment.atlas"]);
    for (const { asset, url, fields } of definitions) {
        const prefab = await Laya.loader.load(url ?? `bootstrap/ui/examples/${asset}.lh`, Laya.Loader.HIERARCHY);
        const view = prefab.create();
        try {
            for (const [name, Type] of Object.entries(fields)) {
                assert(view[name] instanceof Type, `${asset}.${name} was not assigned by the hierarchy parser`);
                let node = view[name];
                while (node && node !== view) node = node.parent;
                assert(node === view, `${asset}.${name} refers outside its Runtime hierarchy`);
                checked++;
            }
            if (asset !== "UIInventoryItem") {
                const scripts = view.getComponents(Lifecycle);
                assert(scripts.length === 1 && scripts[0].enabled,
                    `${asset}: lifecycle script must exist immediately after native Prefab.create`);
                const settings = scripts[0].settings();
                for (const [name, expected] of Object.entries(settingsByAsset[asset])) {
                    assert(settings[name] === expected,
                        `${asset}.${name}: native deserialization ignored prefab policy (${settings[name]} != ${expected})`);
                }
                staticScripts++;
                if (asset !== "UISceneLoading") assert(typeof view.onBind === "function",
                    `${asset}: presentation behavior must belong to its authored Runtime`);
                assert(view.getChild("full") !== view.getChild("safeContent").getChild("full"),
                    `${asset}: background and content slots must remain separate`);
                assert(!Object.hasOwn(view, "full"), `${asset}: duplicate slot names must not become Runtime fields`);
            } else {
                view.render({ id: "native-row", name: "原生绑定", quantity: 2 }, 6);
                assert(view.itemId === "native-row" && view.indexText.text === "07"
                    && view.quantityText.text === "剩余 2 件", "generated item fields are not usable by Runtime behavior");
            }

        } finally {
            view.destroy(true);
        }
    }
    const scope = lx.scenes.get('examples.lobby').ui;
    const centered = await scope.show("lx.examples.fullscreen-mid", { title: "Native Runtime interaction" });
    try {
        assert(centered.counterText.text === "点击次数：0", "new presentation did not initialize its transient state");
        centered.actionButton.event(Laya.Event.CLICK);
        centered.actionButton.event(Laya.Event.CLICK);
        assert(centered.counterText.text === "点击次数：2", "authored Runtime interaction did not update its state");
    } finally { scope.close("lx.examples.fullscreen-mid", centered); }
    const reopened = await scope.show("lx.examples.fullscreen-mid", { title: "New presentation state" });
    try {
        assert(centered.destroyed && reopened !== centered && reopened.counterText.text === "点击次数：0",
            "authored destroy policy or new presentation state was not respected");
        reopened.actionButton.event(Laya.Event.CLICK);
        assert(reopened.counterText.text === "点击次数：1",
            "reopening retained an old click handler or presentation state");
    } finally { scope.close("lx.examples.fullscreen-mid", reopened); }
    return { passed: true, prefabs: definitions.length, boundFields: checked, staticScripts,
        authoredWindowPolicies: Object.keys(settingsByAsset).length, nativeRuntimeInteraction: true, presentationStateReset: true };
}
