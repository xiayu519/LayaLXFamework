export default function renderPerformanceProbe() { return `(${measureUI.toString()})()`; }

async function measureUI() {
    const { lx, Laya } = globalThis;
    const assert = (value, message) => { if (!value) throw new Error(`UI rendering: ${message}`); };
    const frame = () => new Promise(resolve => Laya.timer.frameOnce(1, {}, resolve));
    const settle = async () => { for (let i = 0; i < 65; i++) await frame(); };
    const root = new Laya.GWidget();
    root.name = "UIRenderProbe";
    Laya.stage.addChild(root);
    const host = lx.ui.createSceneUI(root);
    const routes = [];
    const windows = [];
    let reorders = 0;
    const setIndex = root.setChildIndex;
    root.setChildIndex = function(...args) { reorders++; return setIndex.apply(this, args); };
    try {
        for (let i = 0; i < 12; i++) {
            const route = lx.ui.registerView({ id: `probe.render.${i}`,
                url: `__lx_resource_prefab.lh?ui=1&source=confirmation&layout=fullscreen&openMode=stack&modal=false&multiplicity=singleton&retention=hide&case=render${i}`,
                bind(view, args) { view.frame.title = args; },
            });
            routes.push(route);
            windows.push(await host.show(route, `Window ${i}`));
        }
        await settle();
        const idle = lx.performance.capture();
        const samples = [];
        const frames = [];
        reorders = 0;
        for (let i = 0; i < 60; i++) {
            const start = performance.now();
            await host.show(routes[i % routes.length], `Window ${i % routes.length}`);
            samples.push(performance.now() - start);
            await frame();
            frames.push(performance.now() - start);
        }
        const reopenReorders = reorders;
        reorders = 0;
        for (let i = 0; i < 90; i++) {
            windows[i % windows.length].messageText.text = `Update ${i}`;
            await frame();
        }
        assert(reorders === 0, "data updates reordered window roots");
        const changing = lx.performance.capture();
        samples.sort((a, b) => a - b);
        frames.sort((a, b) => a - b);
        assert(idle.statisticsReady && changing.statisticsReady, "statistics are not ready");
        assert(idle.drawCalls2D <= 20 && changing.drawCalls2D <= 20, "render probe exceeded its DC budget");
        return { passed: true, windows: windows.length, idle, changing,
            reopenCpuMs: { median: samples[30], p95: samples[57], max: samples.at(-1) },
            frameMs: { median: frames[30], p95: frames[57], max: frames.at(-1) },
            reopenReorders, dataReorders: reorders };
    } finally {
        root.setChildIndex = setIndex;
        host.dispose();
        await host.waitForPendingLoads();
        root.destroy();
        for (const route of routes) await lx.ui.unregisterView(route);
    }
}
