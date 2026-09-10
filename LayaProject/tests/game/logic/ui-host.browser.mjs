export default function uiHostProbe() { return `(${verifyUIHost.toString()})()`; }

async function verifyUIHost() {
    const { lx, Laya } = globalThis;
    const assert = (value, message) => { if (!value) throw new Error(`UI host: ${message}`); };
    const scene = lx.sceneFlow.current, scope = scene.ui, root = scope.root;
    assert(scene.uiRoot === root && root.parent === scene, "native Runtime export did not bind the scene host");
    const previousOrder = root.zOrder;
    let popup;
    try {
        root.zOrder = 17;
        const rect = { x: 20, y: 30, width: Laya.stage.width - 40, height: Laya.stage.height - 60 };
        scope.setViewport(rect);
        const status = scope.snapshot().views.find(v => v.routeId === "lx.status").view;
        assert(root.x === 20 && root.y === 30 && root.width === rect.width && root.height === rect.height,
            "custom root rectangle was not applied");
        assert(status.width === rect.width && status.height === rect.height && status.x === 0,
            "window was laid out against the stage instead of its host");
        popup = await scope.show("lx.examples.confirm", { title: "局部宿主", message: "布局与遮罩同属宿主", onConfirm() {} });
        assert(popup.width === rect.width && scope.modalLayer.width === rect.width && scope.modalLayer.height === rect.height,
            "popup or mask escaped the custom host");
        const narrowed = { ...rect, x: 32, width: rect.width - 24 };
        scope.setViewport(narrowed);
        assert(root.x === 32 && root.zOrder === 17 && popup.width === narrowed.width
            && scope.modalLayer.width === narrowed.width, "relayout overwrote ordering or left a stale mask");
        let invalid = false;
        try { scope.setViewport({ ...rect, width: -1 }); } catch { invalid = true; }
        assert(invalid && root.width === narrowed.width, "invalid host changed live layout");
        return { passed: true, rootBinding: true, customViewport: true, localMask: true, orderingPreserved: true };
    } finally {
        popup?.destroy();
        scope.setViewport();
        root.zOrder = previousOrder;
        assert(root.x === 0 && root.y === 0 && root.width === Laya.stage.width && root.height === Laya.stage.height,
            "automatic fullscreen host was not restored");
    }
}
