export default function worldTimeProbe() {
    return `(${verifyWorldTime.toString()})()`;
}

async function verifyWorldTime() {
    const { lx, Laya } = globalThis;
    const assert = (condition, message) => { if (!condition) throw new Error(`World time: ${message}`); };
    const frame = () => new Promise(resolve => Laya.timer.frameOnce(3, null, resolve));
    const originalScale = Laya.timer.scale;
    const simulations = [1, 2].map(speed => ({
        speed, elapsed: 0,
        step() { this.elapsed += Laya.timer.unscaledDelta * this.speed; },
    }));
    for (let i = 0; i < simulations.length; i++) {
        lx.worlds.register({ id: `probe.time-${i}`, initialize(world) {
            const simulation = simulations[i];
            world.ownCaller(simulation);
            Laya.timer.frameLoop(1, simulation, simulation.step);
        } });
    }
    try {
        await lx.worlds.enter("probe.time-0");
        await lx.worlds.enter("probe.time-1");
        simulations.forEach(simulation => { simulation.elapsed = 0; });
        await frame();
        assert(simulations[0].elapsed > 0 && Math.abs(simulations[1].elapsed - simulations[0].elapsed * 2) < 0.001,
            "independent 1x/2x simulation deltas diverged");
        simulations[1].speed = 0;
        const paused = simulations[1].elapsed;
        const continuing = simulations[0].elapsed;
        await frame();
        assert(simulations[1].elapsed === paused && simulations[0].elapsed > continuing, "local pause affected another World");
        assert(Laya.timer.scale === originalScale, "World speed modified the global clock");
        return { passed: true, sharedNativeTimer: true, independentDoubleSpeed: true, localPause: true };
    } finally {
        await lx.worlds.unregister("probe.time-0");
        await lx.worlds.unregister("probe.time-1");
    }
}
