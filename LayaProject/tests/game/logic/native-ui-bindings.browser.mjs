/** Verifies native Runtime field assignment, including nested prefab variables. */
export default function nativeUIBindingsProbe() {
    return `(${verifyNativeUIBindings.toString()})()`;
}

async function verifyNativeUIBindings() {
    const { lx, Laya } = globalThis;
    const assert = (condition, message) => {
        if (!condition) throw new Error(`Native UI bindings: ${message}`);
    };
    const definitions = [
        { asset: "SceneLoading", url: "bootstrap/framework/ui/SceneLoading.lh", fields: {
            phaseText: Laya.GTextField, sceneProgressText: Laya.GTextField,
            resourceProgressText: Laya.GTextField, percentText: Laya.GTextField,
            progressFill: Laya.GWidget,
        } },
        { asset: "FrameworkStatus", url: "bootstrap/game/ui/FrameworkStatus.lh", fields: {
            statusText: Laya.GTextField, detailText: Laya.GTextField, examplesButton: Laya.GButton,
            inventoryText: Laya.GTextField, feedbackText: Laya.GTextField, rewardButton: Laya.GButton,
            snapshotButton: Laya.GButton, replayButton: Laya.GButton, inventoryBadge: Laya.GWidget, inventoryBadgeCount: Laya.GTextField,
        } },
        { asset: "Confirmation", fields: {
            frame: Laya.GLabel, messageText: Laya.GTextField,
            cancelButton: Laya.GButton, confirmButton: Laya.GButton,
        } },
        { asset: "Inventory", fields: {
            frame: Laya.GLabel, summaryText: Laya.GTextField, midExampleButton: Laya.GButton,
            itemList: Laya.GList, selectionText: Laya.GTextField,
            resetButton: Laya.GButton, useButton: Laya.GButton, inventoryBadge: Laya.GWidget, inventoryBadgeCount: Laya.GTextField,
        } },
        { asset: "FullscreenMid", fields: {
            frame: Laya.GLabel, counterText: Laya.GTextField, actionButton: Laya.GButton,
        } },
        { asset: "InventoryItem", fields: {
            indexText: Laya.GTextField, quantityText: Laya.GTextField, itemImage: Laya.GLoader,
        } },
    ];
    let checked = 0;
    await Laya.loader.load(["bootstrap/game/ui/examples/icons/supplies.atlas", "bootstrap/game/ui/examples/icons/equipment.atlas"]);
    for (const { asset, url, fields } of definitions) {
        const prefab = await Laya.loader.load(url ?? `bootstrap/game/ui/examples/${asset}.lh`, Laya.Loader.HIERARCHY);
        const view = prefab.create();
        try {
            for (const [name, Type] of Object.entries(fields)) {
                assert(view[name] instanceof Type, `${asset}.${name} was not assigned by the hierarchy parser`);
                let node = view[name];
                while (node && node !== view) node = node.parent;
                assert(node === view, `${asset}.${name} refers outside its Runtime hierarchy`);
                checked++;
            }
            if (asset !== "InventoryItem") {
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
    return { passed: true, prefabs: definitions.length, boundFields: checked };
}
