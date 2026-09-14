export default function worldEventsProbe() {
    return `(${verifyWorldEvents.toString()})()`;
}

async function verifyWorldEvents() {
    const { lx, Laya } = globalThis;
    const assert = (condition, message) => { if (!condition) throw new Error(`World events: ${message}`); };
    const frame = () => new Promise(resolve => Laya.timer.frameOnce(2, null, resolve));
    const received = [];
    const globalEvents = lx.events;
    const rootCaller = { onUpdated(value) { received.push(`root:${value.count}`); } };
    const activations = [];
    const routes = [];
    const sharedView = { id: "probe.world-view", url: "bootstrap/ui/examples/UIBattle.lh" };
    const source = new Laya.EventDispatcher();
    globalEvents.on("probe:updated", rootCaller, rootCaller.onUpdated);
    for (const id of ["probe.one", "probe.two"]) {
        lx.worlds.register({ id, create() {
            const caller = {
                x: 0, ticks: 0,
                tick() { this.ticks++; },
                onUpdated(value) { received.push(`${id}:${value.count}`); },
                onLocal() { received.push(`${id}:local`); },
            };
            activations.push(caller);
            return { id, initialize(world) {
                world.listen(globalEvents, "probe:updated", caller, caller.onUpdated);
                world.listen(world.events, "local", caller, caller.onLocal);
                const off = world.listen(source, "temporary", caller, caller.onLocal);
                assert(world.listen(source, "temporary", caller, caller.onLocal) === off,
                    "duplicate native tuple accumulated ownership records");
                off();
                const replacementOff = world.listen(source, "temporary", caller, caller.onLocal);
                off();
                source.event("temporary");
                assert(received.pop() === `${id}:local`, "stale unsubscribe removed the new subscription");
                replacementOff();
                source.event("temporary");
                world.ownCaller(caller);
                Laya.timer.frameLoop(1, caller, caller.tick);
                Laya.Tween.create(caller).duration(10000).to("x", 1000);
                if (id === "probe.one") routes.push(world.registerView(sharedView));
            } };
        } });
    }
    try {
        assert(globalEvents instanceof Laya.EventDispatcher, "public events is not a native dispatcher");
        const one = await lx.worlds.enter("probe.one");
        const two = await lx.worlds.enter("probe.two");
        assert(one.events !== two.events && one.events !== globalEvents, "event sources are shared");
        await frame();
        assert(activations.every(caller => caller.ticks > 0), "native timers did not run");
        one.events.event("local");
        assert(received.join() === "probe.one:local", "local event reached another World or detached listener");
        const firstCaller = activations[0];
        await lx.worlds.exit("probe.one");
        const ticks = firstCaller.ticks;
        const x = firstCaller.x;
        await frame();
        assert(firstCaller.ticks === ticks && firstCaller.x === x && !Laya.Tween.isTweening(firstCaller),
            "exited World's native timer/tween survived");
        received.length = 0;
        globalEvents.event("probe:updated", { count: 7 });
        one.events.event("local");
        two.events.event("local");
        assert(received.join() === "root:7,probe.two:7,probe.two:local", "exit removed foreign listeners or retained local ones");
        const replacement = await lx.worlds.enter("probe.one");
        assert(replacement !== one && activations.length === 3 && routes[0] !== routes[1], "activation reused mutable owners");
        await lx.ui.unregisterView(routes[0]);
        let duplicateRejected = false;
        try { lx.ui.registerView(sharedView); } catch { duplicateRejected = true; }
        assert(duplicateRejected, "stale cleanup unregistered the replacement's UI definition");
        return { passed: true, nativeDispatchers: true, localIsolation: true, exactUnsubscribe: true,
            nativeTimerAndTweenCleanup: true, freshActivations: true, staleRegistrationProtected: true };
    } finally {
        globalEvents.offAllCaller(rootCaller);
        source.offAll();
        await lx.worlds.unregister("probe.one");
        await lx.worlds.unregister("probe.two");
    }
}
