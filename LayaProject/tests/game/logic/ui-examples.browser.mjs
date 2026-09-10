/** Run against the built project with --suite targeted --probe <this file>. */
export default function uiExamplesProbe() {
    return `(${runUIExamples.toString()})()`;
}

async function runUIExamples() {
    const { lx, Laya } = globalThis;
    const ui = lx.scenes.get('examples.lobby').ui;
    const layoutService = lx.ui.layout;
    const inventoryId = "lx.examples.inventory";
    const confirmId = "lx.examples.confirm";
    const centeredId = "lx.examples.fullscreen-mid";
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
    const visible = (id) => ui.snapshot().views.find(entry => entry.routeId === id && entry.visible)?.view;
    const paneOf = target => target instanceof Laya.GWindow ? target.contentPane : target;
    const closeButtonOf = target => target instanceof Laya.GWindow ? target.closeButton : target.frame.getChild("closeButton");
    const activeExamples = () => ui.snapshot().views.filter(entry => entry.visible && entry.routeId.startsWith("lx.examples."));
    const skeleton = (pane) => {
        assert(pane.children.map(node => node.name).join("/") === "full/safeContent", "root skeleton order");
        const safe = pane.getChild("safeContent");
        assert(safe.children.map(node => node.name).join("/") === "top/full/mid/bottom", "safe skeleton order");
        return safe;
    };
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
    const platform = lx.platform;
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
        const view = paneOf(window);
        const layout = layoutService.snapshot();
        const safe = skeleton(view);
        const top = safe.getChild("top");
        const content = safe.getChild("full");
        const bottom = safe.getChild("bottom");
        assert(safe.getChild("mid").numChildren === 0, "unused mid must remain empty in the stretching list example");
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
        within(rect(closeButtonOf(window)), t, "close button");
        within(rect(view.summaryText), t, "summary");
        within(rect(view.midExampleButton), t, "centered example entry");
        assert(rect(view.summaryText).x + rect(view.summaryText).width <= rect(view.midExampleButton).x,
            "summary overlaps the centered example entry");
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
        skeleton(paneOf(status));
        const entryButton = paneOf(status).findChild("examplesButton", Laya.GButton);
        assert(entryButton.title === "打开旅行背包", "startup button label");
        click(entryButton);
        await wait(() => visible(inventoryId), "startup example button");
        const window = visible(inventoryId);
        const view = paneOf(window);
        const list = view.itemList;
        await wait(() => list.numChildren > 0, "virtual rows");
        renderedRows = list.numChildren;
        assert(list.numItems === 100 && renderedRows < 25, "list must virtualize 100 entries");
        assert(view.width === Laya.GRoot.inst.width && view.height === Laya.GRoot.inst.height,
            "fullscreen pane must follow the actual root");
        assert(window instanceof Laya.GWidget && !(window instanceof Laya.GWindow) && window.parent === ui.root, "fullscreen page must belong to the native scene uiRoot");
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
            // Covered pages still adapt their authored geometry; their data subscriptions stay paused.
            const statusArea = layoutService.snapshot().topSafeArea;
            for (const name of ["examplesButton", "rewardButton", "snapshotButton", "replayButton", "inventoryText", "feedbackText"]) {
                within(rect(status[name]), statusArea, `status ${name}`);
            }
            const selected = await inspectRow(list, 9);
            click(selected);
            assert(list.selection.index === 9 && view.selectionText.text.includes("010"), `${profile.name}: select after reflow`);
            const popup = await openConfirmation(view);
            const mid = skeleton(popup).getChild("mid");
            within(rect(mid), layoutService.snapshot().topSafeArea, `${profile.name}: popup`);
            assert(popup.width === Laya.GRoot.inst.width && popup.height === Laya.GRoot.inst.height, "popup root must stay fullscreen");
            assert(popup.frame.parent === mid && popup.confirmButton.parent === mid, "popup controls must belong to mid");
            within(rect(popup.confirmButton), rect(mid), "popup confirm button");
            within(rect(closeButtonOf(popup)), rect(mid), "popup close button");
            click(popup.cancelButton);
            await wait(() => popup.destroyed, "cancel after reflow");
            click(view.resetButton);
            assert(list.selection.index === 0, `${profile.name}: reset after reflow`);
        }

        // The same fullscreen centered window survives every safe-area change, including scale restoration.
        click(view.midExampleButton);
        await wait(() => visible(centeredId), "fullscreen centered example entry");
        const centered = visible(centeredId), centerPane = paneOf(centered);
        const centerSafe = skeleton(centerPane), centerMid = centerSafe.getChild("mid");
        const centerFull = centerSafe.getChild("full");
        assert(!(centered instanceof Laya.GWindow) && centered.parent === ui.root && centerFull.numChildren === 0,
            "centered fullscreen must use mid while preserving its empty full slot");
        const action = centerPane.findChild("actionButton", Laya.GButton);
        const counter = centerPane.findChild("counterText", Laya.GTextField);
        const centeredScales = [];
        let clicks = 0;
        for (const profile of profiles) {
            Object.defineProperty(platform, "viewport", { configurable: true, get: () => profile.viewport });
            Laya.stage.event(Laya.Event.RESIZE);
            await frame();
            const snapshot = layoutService.snapshot(), s = rect(centerSafe), m = rect(centerMid);
            const top = rect(centerSafe.getChild("top")), bottom = rect(centerSafe.getChild("bottom"));
            within(m, snapshot.safeArea, "fullscreen mid");
            assert(Math.abs(m.x + m.width / 2 - s.x - s.width / 2) < 1
                && Math.abs(m.y + m.height / 2 - s.y - s.height / 2) < 1, "fullscreen mid lost its center");
            assert(m.y >= top.y + top.height - 1 && m.y + m.height <= bottom.y + 1, "fullscreen mid overlaps edge slots");
            assert(centerPane.width === Laya.GRoot.inst.width && centerPane.height === Laya.GRoot.inst.height
                && centerPane.scaleX === 1, "fullscreen centered root changed scale or screen coverage");
            within(rect(action), m, "centered action");
            within(rect(closeButtonOf(centered)), m, "centered close button");
            click(action); clicks++;
            assert(counter.text.endsWith(String(clicks)), "empty full slot blocked centered content input");
            centeredScales.push(centerMid.scaleX);
        }
        assert(Math.abs(centeredScales[0] - centeredScales.at(-1)) < 0.001, "centered scale did not restore");
        click(closeButtonOf(centered));
        await wait(() => centered.destroyed, "centered native frame close");
        click(view.midExampleButton);
        await wait(() => visible(centeredId), "centered reopen");
        const reopenedCenter = visible(centeredId);
        assert(paneOf(reopenedCenter).findChild("counterText", Laya.GTextField).text.endsWith("0"), "centered example retained old state");
        click(closeButtonOf(reopenedCenter));
        await wait(() => reopenedCenter.destroyed, "centered reopened close");

        const row = await inspectRow(list, 89);
        rows.add(row);
        click(row);
        assert(list.selection.index === 89 && view.selectionText.text.includes("090"), "native item selection");
        const marker = row.getChild("selectedBorder");
        const gear = marker.gears.find((entry) => entry instanceof Laya.GearDisplay);
        assert(row.selected && marker.visible && gear.pages.includes(gear.controller.selectedIndex),
            "selected marker must be enabled on the controller's actual page");
        const cancelled = await openConfirmation(view);
        const cancelledMid = cancelled.getChild("safeContent").getChild("mid");
        assert(cancelledMid.width === 560 && cancelledMid.height === 390,
            "popup must retain its own authored size");
        assert(closeButtonOf(cancelled) === cancelled.frame.getChild("closeButton"), "nested frame close binding");
        assert(ui.root.getChildIndex(ui.modalLayer)
            === ui.root.getChildIndex(cancelled) - 1, "modal mask order");
        click(cancelled.cancelButton);
        await wait(() => cancelled.destroyed, "cancel destruction");
        assert(view.summaryText.text.includes("300"), "cancel must not consume an item");

        const confirmed = await openConfirmation(view);
        const confirmButton = confirmed.confirmButton;
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
        const lateButton = ownedPopup.confirmButton;
        click(closeButtonOf(window));
        assert(!window.destroyed, "modal must block clicks on the underlying window");
        ui.close(inventoryId); // Simulate the owner leaving while a modal is still open.
        lateButton.fireClick();
        await wait(() => !window.parent && ownedPopup.destroyed, "owner closes child popup");
        assert(activeExamples().length === 0 && !window.destroyed, "hidden parent must retain its view and close its child");

        for (let cycle = 0; cycle < 8; cycle++) {
            const next = await ui.show(inventoryId, { title: `旅行背包 ${cycle + 1}` });
            const pane = paneOf(next);
            const recycled = await inspectRow(pane.itemList, 99);
            rows.add(recycled);
            assert(pane.summaryText.text.includes("300"), "reopen must not retain consumed data");
            assert(pane.itemList.numChildren < 25, "scrolling must keep display object count bounded");
            click(closeButtonOf(next));
            await wait(() => !next.parent, "close and reopen cycle");
            assert(next === window && activeExamples().length === 0, "retained cycle created duplicate views");
        }

        const pending = ui.show(inventoryId, { title: "已取消的打开请求" }).then(
            () => false, () => true,
        );
        ui.close(inventoryId);
        assert(await pending, "immediate close must cancel pending open");
        await ui.waitForPendingLoads();
        assert(activeExamples().length === 0, "cancelled open left an orphan window");
        window.destroy();
        await frame();
        assert(list.itemPool.count === 0 && [...rows].every((row) => row.destroyed), "native rows survived owner destruction");
        return { passed: true, viewport: `${innerWidth}x${innerHeight}`, layouts, centeredScales, items: 100, renderedRows,
            reopenCycles: 8, confirmation: "cancel / once / owner close", pendingOpen: "cancelled" };
    } finally {
        ui.close(confirmId);
        ui.close(centeredId);
        ui.close(inventoryId);
        await ui.waitForPendingLoads();
        await wait(() => activeExamples().length === 0, "final cleanup");
        if (originalViewport) Object.defineProperty(platform, "viewport", originalViewport);
        else delete platform.viewport;
        Laya.stage.event(Laya.Event.RESIZE);
    }
}
