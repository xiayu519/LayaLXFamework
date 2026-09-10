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
    const platform = LX.Platform;
    const originalViewport = Object.getOwnPropertyDescriptor(platform, "viewport");
    const hostViewport = platform.viewport;
    const layouts = [];
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rect = (node) => {
        const start = node.localToGlobal(new Laya.Point(0, 0));
        const end = node.localToGlobal(new Laya.Point(node.width, node.height));
        return { x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y };
    };
    const within = (inner, outer, label) => assert(inner.x >= outer.x - 1 && inner.y >= outer.y - 1
        && inner.x + inner.width <= outer.x + outer.width + 1
        && inner.y + inner.height <= outer.y + outer.height + 1, `${label} overflows ${JSON.stringify({ inner, outer })}`);
    const checkLayout = (window) => {
        const view = window.contentPane;
        const layout = ui.layout.snapshot();
        const safe = view.getChild("safeContent");
        const top = safe.getChild("top");
        const content = safe.getChild("full");
        const bottom = safe.getChild("bottom");
        assert(top && content && bottom && !safe.getChild("mid"), "stretching lists require top/full/bottom");
        assert(view.frame.parent === top && view.summaryText.parent === top, "header belongs to top");
        assert(view.itemList.parent.parent === content, "list belongs to safeContent/full");
        assert(view.selectionText.parent === bottom && view.useButton.parent.parent === bottom
            && view.resetButton.parent.parent === bottom, "selection and actions belong to bottom");
        const bleed = rect(view.getChild("full"));
        assert(Math.abs(bleed.width - Laya.GRoot.inst.width) < 1
            && Math.abs(bleed.height - Laya.GRoot.inst.height) < 1 && bleed.x === 0 && bleed.y === 0,
            "fullBleed must cover the live viewport");
        const safeRect = rect(safe);
        within(safeRect, layout.safeArea, "safeContent");
        assert(Math.abs(safeRect.width - layout.safeArea.width) < 1
            && Math.abs(safeRect.height - layout.safeArea.height) < 1, "safeContent must fill the safe area");
        const t = rect(top), m = rect(content), b = rect(bottom);
        assert(Math.abs(t.y - layout.topSafeArea.y) < 1, "top must start below the notch and capsule");
        assert(Math.abs(b.y + b.height - safeRect.y - safeRect.height) < 1, "bottom must remain anchored");
        assert(Math.abs(m.y - t.y - t.height) < 1 && Math.abs(m.y + m.height - b.y) < 1,
            "full content must fill the exact space between top and bottom");
        assert(Math.abs(m.x - safeRect.x) < 1 && Math.abs(m.width - safeRect.width) < 1,
            "full content width must follow the safe area");
        assert(content.scaleX === 1 && content.scaleY === 1, "scrolling content must resize without scaling rows");
        within(rect(view.frame), t, "header frame");
        within(rect(window.closeButton), t, "close button");
        within(rect(view.summaryText), t, "summary");
        within(rect(view.itemList), m, "list");
        assert(Math.abs(view.itemList.width - content.width + 96) < 1
            && Math.abs(view.itemList.height - content.height + 104) < 1,
            "list must stretch with full content while retaining its padding");
        assert(view.itemList.scaleX === 1 && view.itemList.scaleY === 1, "list was scaled instead of resized");
        const firstRow = view.itemList.getChildAt(0);
        assert(firstRow.height === 88 && firstRow.scaleX === 1 && firstRow.scaleY === 1
            && firstRow.getChild("titleText").fontSize === 22, "list row height or text size changed during adaptation");
        within(rect(view.selectionText), b, "selection");
        within(rect(view.useButton), b, "use button");
        within(rect(view.resetButton), b, "reset button");
        const reset = rect(view.resetButton), use = rect(view.useButton);
        assert(reset.x + reset.width < use.x, `footer buttons overlap ${JSON.stringify({ reset, use })}`);
        return { stage: `${view.width}x${view.height}`, contentHeight: content.height,
            listHeight: view.itemList.height, rowHeight: view.itemList.getChildAt(0)?.height };
    };
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

        const { width, height } = hostViewport;
        const profiles = [
            { name: "plain", viewport: { width, height } },
            { name: "notch-capsule", viewport: {
                width, height, safeArea: { x: 0, y: 44, width, height: height - 78 },
                topRightAvoidance: { x: width - 100, y: 48, width: 88, height: 32 },
            } },
            { name: "side-insets", viewport: {
                width, height, safeArea: { x: 20, y: 32, width: width - 40, height: height - 56 },
                topRightAvoidance: { x: width - 110, y: 36, width: 88, height: 32 },
            } },
            { name: "restored", viewport: hostViewport },
        ];
        for (const profile of profiles) {
            Object.defineProperty(platform, "viewport", { configurable: true, get: () => profile.viewport });
            Laya.stage.event(Laya.Event.RESIZE);
            await frame();
            layouts.push({ profile: profile.name, ...checkLayout(window) });
            const selected = await inspectRow(list, 9);
            click(selected);
            assert(list.selection.index === 9 && view.selectionText.text.includes("010"), `${profile.name}: select after reflow`);
            const popup = await openConfirmation(view);
            const mid = popup.contentPane.getChild("safeContent").getChild("mid");
            within(rect(mid), ui.layout.snapshot().topSafeArea, `${profile.name}: popup`);
            assert(popup.contentPane.width === Laya.GRoot.inst.width && popup.contentPane.height === Laya.GRoot.inst.height, "popup root must stay fullscreen");
            assert(popup.contentPane.frame.parent === mid && popup.contentPane.confirmButton.parent === mid, "popup controls must belong to mid");
            within(rect(popup.contentPane.confirmButton), rect(mid), "popup confirm button");
            within(rect(popup.closeButton), rect(mid), "popup close button");
            click(popup.contentPane.cancelButton);
            await wait(() => popup.destroyed, "cancel after reflow");
            click(view.resetButton);
            assert(list.selection.index === 0, `${profile.name}: reset after reflow`);
        }

        const row = await inspectRow(list, 89);
        rows.add(row);
        click(row);
        assert(list.selection.index === 89 && view.selectionText.text.includes("090"), "native item selection");
        const marker = row.getChild("selectedBorder");
        const gear = marker.gears.find((entry) => entry instanceof Laya.GearDisplay);
        assert(row.selected && marker.visible && gear.pages.includes(gear.controller.selectedIndex),
            "selected marker must be enabled on the controller's actual page");
        const cancelled = await openConfirmation(view);
        const cancelledMid = cancelled.contentPane.getChild("safeContent").getChild("mid");
        assert(cancelledMid.width === 560 && cancelledMid.height === 390,
            "popup must retain its own authored size");
        assert(cancelled.closeButton === cancelled.contentPane.frame.getChild("closeButton"), "nested frame close binding");
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
        return { passed: true, viewport: `${innerWidth}x${innerHeight}`, layouts, items: 100, renderedRows,
            reopenCycles: 8, confirmation: "cancel / once / owner close", pendingOpen: "cancelled" };
    } finally {
        ui.close(confirmId);
        ui.close(inventoryId);
        await ui.waitForPendingLoads();
        await wait(() => activeExamples().length === 0, "final cleanup");
        if (originalViewport) Object.defineProperty(platform, "viewport", originalViewport);
        else delete platform.viewport;
        Laya.stage.event(Laya.Event.RESIZE);
    }
}
