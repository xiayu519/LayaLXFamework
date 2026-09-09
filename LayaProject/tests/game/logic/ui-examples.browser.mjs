/** Run against the built project with --suite targeted --probe <this file>. */
export default function uiExamplesProbe() {
    return `(${runUIExamples.toString()})()`;
}

async function runUIExamples() {
    const { LX, Laya } = globalThis;
    const ui = LX.UI;
    const inventoryId = "lx.examples.inventory";
    const confirmId = "lx.examples.confirm";
    const assert = (condition, message) => {
        if (!condition) throw new Error(`UI examples: ${message}`);
    };
    const wait = async (predicate, label) => {
        const deadline = performance.now() + 4000;
        while (!predicate()) {
            if (performance.now() > deadline) throw new Error(`UI examples timed out: ${label}`);
            await new Promise((resolve) => setTimeout(resolve, 10));
        }
    };
    const visible = (id) => ui.listVisible().find((entry) => entry.routeId === id)?.window;
    const activeExamples = () => ui.listManaged().filter((entry) => entry.routeId.startsWith("lx.examples."));
    const click = (button) => {
        const point = Laya.SpriteUtils.getTransformRelativeToWindow(button, button.width / 2, button.height / 2);
        const canvas = document.querySelector("canvas");
        for (const type of ["mousemove", "mousedown", "mouseup"]) {
            canvas.dispatchEvent(new MouseEvent(type, {
                bubbles: true, clientX: point.x, clientY: point.y, button: 0,
                buttons: type === "mousedown" ? 1 : 0,
            }));
        }
    };
    const openConfirmation = async (view) => {
        click(view.useButton);
        await wait(() => visible(confirmId)?.mouseEnabled, "confirmation animation");
        return visible(confirmId);
    };
    const inspectRow = async (list, index) => {
        list.scroller.scrollTo(index, false);
        await wait(() => list.itemIndexToChildIndex(index) >= 0, `row ${index}`);
        const row = list.getChildAt(list.itemIndexToChildIndex(index));
        assert(row.itemId === `supply-${index + 1}`, "recycled row retained another item ID");
        assert(row.title.endsWith(String(index + 1).padStart(3, "0")), "recycled row title is stale");
        return row;
    };
    const rows = new Set();
    let renderedRows = 0;
    try {
        const status = visible("lx.status");
        assert(status, "startup window missing");
        const entryButton = status.contentPane.findChild("examplesButton", Laya.GButton);
        assert(entryButton.title === "打开 UI 示例", "startup button label");
        click(entryButton);
        await wait(() => visible(inventoryId), "startup example button");
        const window = visible(inventoryId);
        const view = window.contentPane;
        const list = view.itemList;
        await wait(() => list.numChildren > 0, "virtual rows");
        renderedRows = list.numChildren;
        assert(list.numItems === 100 && renderedRows < 25, "list must virtualize 100 entries");
        assert(view.width === Laya.GRoot.inst.width && view.height === Laya.GRoot.inst.height,
            "fullscreen pane must follow the actual root");
        assert(window.closeButton === view.frame.getChild("closeButton"), "nested fullscreen frame close binding");
        assert(view.frame.title === "旅行背包", "typed frame binding");

        const row = await inspectRow(list, 89);
        rows.add(row);
        click(row);
        assert(list.selection.index === 89 && view.selectionText.text.includes("090"), "native item selection");
        const marker = row.getChild("selectedBorder");
        const gear = marker.gears.find((entry) => entry instanceof Laya.GearDisplay);
        assert(row.selected && marker.visible && gear.pages.includes(gear.controller.selectedIndex),
            "selected marker must be enabled on the controller's actual page");
        const cancelled = await openConfirmation(view);
        assert(cancelled.contentPane.width === 560 && cancelled.contentPane.height === 390,
            "popup must retain its own authored size");
        assert(cancelled.closeButton === cancelled.contentPane.frame.getChild("closeButton"), "native frame discovery");
        assert(Laya.GRoot.inst.getChildIndex(Laya.GRoot.inst.modalLayer)
            === Laya.GRoot.inst.getChildIndex(cancelled) - 1, "modal mask order");
        click(cancelled.contentPane.cancelButton);
        await wait(() => cancelled.destroyed, "cancel destruction");
        assert(view.summaryText.text.includes("300"), "cancel must not consume an item");

        const confirmed = await openConfirmation(view);
        const confirmButton = confirmed.contentPane.confirmButton;
        click(confirmButton);
        confirmButton.fireClick();
        await wait(() => confirmed.destroyed, "confirm destruction");
        assert(view.summaryText.text.includes("299"), "double confirm must consume only once");
        await wait(() => row.quantityText.text.includes("2"), "row refresh after confirmation");
        assert(view.selectionText.text.includes("090"), "confirmation must preserve selection");

        click(view.resetButton);
        assert(view.summaryText.text.includes("300") && list.selection.index === 0, "reset data and selection");
        const first = await inspectRow(list, 0);
        assert(first.quantityText.text.includes("3") && !first.grayed, "pooled row must reset quantity and disabled state");

        const ownedPopup = await openConfirmation(view);
        const lateButton = ownedPopup.contentPane.confirmButton;
        click(window.closeButton);
        assert(!window.destroyed, "modal must block clicks on the underlying window");
        ui.close(inventoryId); // Simulate the owner leaving while a modal is still open.
        lateButton.fireClick();
        await wait(() => window.destroyed && ownedPopup.destroyed, "owner closes child popup");
        assert(activeExamples().length === 0 && list.itemPool.count === 0, "destroy must empty native list pool");

        for (let cycle = 0; cycle < 8; cycle++) {
            const next = await ui.show(inventoryId, { title: `旅行背包 ${cycle + 1}` });
            const pane = next.contentPane;
            const recycled = await inspectRow(pane.itemList, 99);
            rows.add(recycled);
            assert(pane.summaryText.text.includes("300"), "reopen must not retain consumed data");
            assert(pane.itemList.numChildren < 25, "scrolling must keep display object count bounded");
            click(next.closeButton);
            await wait(() => next.destroyed, "close and reopen cycle");
            assert(pane.itemList.itemPool.count === 0 && activeExamples().length === 0, "cycle leaked managed UI or pooled rows");
        }

        const pending = ui.show(inventoryId, { title: "已取消的打开请求" }).then(
            () => false, () => true,
        );
        ui.close(inventoryId);
        assert(await pending, "immediate close must cancel pending open");
        await ui.waitForPendingLoads();
        assert(activeExamples().length === 0, "cancelled open left an orphan window");
        assert([...rows].every((row) => row.destroyed), "sampled virtual rows survived window destruction");
        return { passed: true, items: 100, renderedRows, reopenCycles: 8, confirmation: "cancel / once / owner close", pendingOpen: "cancelled" };
    } finally {
        ui.close(confirmId);
        ui.close(inventoryId);
        await ui.waitForPendingLoads();
        await wait(() => activeExamples().length === 0, "final cleanup");
    }
}
