/** Self-contained browser function: stringify and evaluate with awaitPromise/returnByValue. */
export async function runFrameworkProbes(validation) {
    const { LX, Laya } = globalThis;
    const ui = LX.UI;
    const root = Laya.GRoot.inst;
    const base = ui.snapshot().managed.find((entry) => entry.routeId === validation.uiProbe.baseRouteId);
    if (!base) throw new Error("Framework probe requires an existing registered window constructor.");
    const assert = (condition, message) => {
        if (!condition) throw new Error(`Framework probe failed: ${message}`);
    };
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const bounded = async (operation, label) => {
        let timer;
        try {
            return await Promise.race([
                operation,
                new Promise((_resolve, reject) => {
                    timer = setTimeout(() => reject(new Error(`Framework probe timed out: ${label}`)), 3000);
                }),
            ]);
        } finally { clearTimeout(timer); }
    };
    const waitUntil = async (predicate, label) => {
        const deadline = performance.now() + 3000;
        while (!predicate()) {
            if (performance.now() > deadline) throw new Error(`Framework probe timed out: ${label}`);
            await delay(10);
        }
    };
    const frame = () => bounded(new Promise((resolve) => Laya.timer.frameOnce(1, {}, resolve)), "engine frame");
    const settled = (operation) => operation.then(
        (value) => ({ ok: true, value }),
        (error) => ({ ok: false, error: String(error) }),
    );
    const prefix = `__lx_framework_probe_${Date.now()}`;
    const live = new Set();
    const isolatedRouters = [];
    let poolRegistered = false;
    const poolId = `${prefix}_pool`;
    class ProbeWindow extends base.window.constructor {
        constructor(pane) {
            super(pane);
            live.add(this);
            this.lifetime.defer(() => live.delete(this));
        }
        onBind(args, token) { return args.bind?.(this, token, this.presentation); }
    }
    const register = (router, id, options = {}) => router.register({
        id: `${prefix}_${id}`, url: validation.uiProbe.prefabUrl,
        layer: 3, modal: false, multiplicity: "singleton", retention: "destroy",
        create: (pane) => new ProbeWindow(pane), ...options,
    });
    const modalOrder = (expected) => {
        assert(ui.getTop()?.window === expected, "router top differs from highest modal");
        assert(root.getChildIndex(root.modalLayer) === root.getChildIndex(expected) - 1,
            "modal mask must be immediately below the highest modal");
        assert(root.modalLayer.zOrder === expected.zOrder, "modal mask zOrder differs from highest modal");
    };

    try {
        for (const order of ["old-first", "new-first", "old-reject"]) {
            const route = register(ui, `binding_${order}`, { retention: "hide" });
            const window = await ui.show(route, {});
            const cleaned = [];
            const waits = {};
            const bind = (label) => (target, token, scope) => {
                scope.defer(() => cleaned.push(label));
                return new Promise((resolve, reject) => { waits[label] = { resolve, reject }; })
                    .then(() => token.commit(() => { target.probeValue = label; }));
            };
            const first = settled(ui.show(route, { bind: bind("old") }));
            const second = settled(ui.show(route, { bind: bind("new") }));
            if (order === "new-first") {
                waits.new.resolve();
                assert((await bounded(second, "latest binding")).ok, "latest binding did not complete");
                waits.old.resolve();
            } else {
                if (order === "old-reject") waits.old.reject(new Error("expected late binding rejection"));
                else waits.old.resolve();
                assert(!(await bounded(first, "superseded binding")).ok, "superseded binding unexpectedly completed");
                waits.new.resolve();
            }
            assert((await bounded(second, "latest binding")).ok, "latest binding was cancelled by an old operation");
            assert(!(await bounded(first, "superseded binding")).ok, "old binding unexpectedly succeeded");
            await frame();
            assert(!window.destroyed && window.isShowing && window.probeValue === "new", "late write changed the latest window");
            assert(cleaned.join(",") === "old", "old binding cleaned the current presentation");
            ui.close(route.id);
            assert(cleaned.join(",") === "old,new", "closing did not clean the current presentation once");
            window.destroy();
        }

        for (const action of ["close", "destroy", "dispose", "signal"]) {
            const router = new ui.constructor();
            isolatedRouters.push(router);
            const route = register(router, `cancel_${action}`);
            const controller = new AbortController();
            let lateReject;
            let tokenSignal;
            let window;
            const result = settled(router.show(route, {
                bind: (target, token) => {
                    window = target;
                    tokenSignal = token.signal;
                    return new Promise((_resolve, reject) => { lateReject = reject; });
                },
            }, { signal: controller.signal }));
            await waitUntil(() => router.snapshot().pendingRequests.some((request) => request.phase === "binding"), "pending binding diagnostics");
            if (action === "close") router.close(route.id);
            else if (action === "destroy") window.destroy();
            else if (action === "dispose") router.dispose();
            else controller.abort();
            assert(!(await bounded(result, `binding cancellation by ${action}`)).ok, "cancelled binding unexpectedly succeeded");
            assert(tokenSignal.aborted, "binding token did not receive cancellation");
            await bounded(router.waitForPendingLoads(), "UI drain after binding cancellation");
            assert(router.snapshot().pendingRequests.length === 0, "cancelled binding remained pending");
            lateReject(new Error("expected rejection after binding cancellation"));
            await frame();
            router.dispose();
        }

        for (const [firstLayer, secondLayer] of [[6, 3], [3, 6], [3, 3]]) {
            const key = `${firstLayer}_${secondLayer}`;
            const firstRoute = register(ui, `modal_first_${key}`, { layer: firstLayer, modal: true });
            const secondRoute = register(ui, `modal_second_${key}`, { layer: secondLayer, modal: true });
            const first = await ui.show(firstRoute, {});
            await frame();
            const second = await ui.show(secondRoute, {});
            await frame();
            modalOrder(firstLayer > secondLayer ? first : second);
            first.bringToFront();
            await frame();
            modalOrder(firstLayer >= secondLayer ? first : second);
            second.bringToFront();
            await frame();
            modalOrder(firstLayer > secondLayer ? first : second);
            ui.close(secondRoute.id);
            await frame();
            modalOrder(first);
            ui.close(firstRoute.id);
        }

        await frame();
        const before = { managed: ui.listManaged().length, children: root.numChildren };
        const counts = { windowCreated: 0, windowDestroyed: 0, poolCreated: 0, poolAcquired: 0, poolReleased: 0 };
        const repeatedRoute = register(ui, "repeat", {
            create: (pane) => {
                const window = new ProbeWindow(pane);
                counts.windowCreated += 1;
                window.lifetime.defer(() => { counts.windowDestroyed += 1; });
                return window;
            },
        });
        LX.Pool.register({
            id: poolId, url: validation.uiProbe.prefabUrl, maxIdle: 1, maxActive: 1,
            create: (prefab) => { counts.poolCreated += 1; return prefab.create(); },
            onAcquire: () => { counts.poolAcquired += 1; },
            onRelease: () => { counts.poolReleased += 1; },
        });
        poolRegistered = true;
        for (let cycle = 0; cycle < 100; cycle += 1) {
            const window = await ui.show(repeatedRoute, {});
            const node = await LX.Pool.acquire(poolId);
            root.addChild(node);
            await frame();
            LX.Pool.release(poolId, node);
            LX.Pool.drain(poolId);
            ui.close(repeatedRoute.id);
            await frame();
            assert(window.destroyed && node.destroyed, `cycle ${cycle} retained a node owner`);
            const snapshot = LX.Pool.snapshot().find((entry) => entry.id === poolId);
            assert(snapshot?.active === 0 && snapshot.pending === 0 && snapshot.idle === 0
                && snapshot.cleanupFailures === 0, `cycle ${cycle} pool counts did not return to zero`);
            assert(ui.listManaged().length === before.managed && root.numChildren === before.children,
                `cycle ${cycle} UI/root counts did not return to baseline`);
        }
        await ui.waitForPendingLoads();
        await LX.Pool.waitForPendingLoads();
        Laya.Scene.gc();
        await frame();
        const after = { managed: ui.listManaged().length, children: root.numChildren };
        assert(Object.values(counts).every((count) => count === 100), "repeat creation/release counts differ");
        assert(ui.snapshot().pendingRequests.length === 0 && ui.snapshot().nativeLoads === 0,
            "repeat cycle left pending UI work");
        assert(before.managed === after.managed && before.children === after.children, "final UI/root counts drifted");
        return {
            bindingIsolation: true, bindingCancellation: true, modalOrdering: true,
            repeatCycles: 100, stableCounts: true, before, after, counts,
        };
    } finally {
        const errors = [];
        for (const window of Array.from(live)) {
            try { window.destroy(); } catch (error) { errors.push(error); }
        }
        for (const router of isolatedRouters) {
            try { router.dispose(); } catch (error) { errors.push(error); }
        }
        if (poolRegistered) {
            try { LX.Pool.drain(poolId); } catch (error) { errors.push(error); }
        }
        if (errors.length) throw new Error(`Framework probe cleanup failed: ${errors.map(String).join("; ")}`);
    }
}
