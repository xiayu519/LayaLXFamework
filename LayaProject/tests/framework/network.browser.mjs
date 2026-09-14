export default function networkProbe() {
    return `(${verifyNetwork.toString()})()`;
}

async function verifyNetwork() {
    const { lx, Laya } = globalThis;
    const assert = (condition, message) => { if (!condition) throw new Error(`WebSocket: ${message}`); };
    const socket = lx.net;
    const caller = {};
    const url = `ws://${location.host}/__lx_ws`;
    const next = type => new Promise((resolve, reject) => {
        const done = value => {
            socket.off(Laya.Event.ERROR, caller, failed);
            resolve(value);
        };
        const failed = error => {
            socket.off(type, caller, done);
            reject(error);
        };
        socket.once(type, caller, done);
        socket.once(Laya.Event.ERROR, caller, failed);
    });
    const connect = async () => {
        const opened = next(Laya.Event.OPEN);
        lx.net.connectByUrl(url);
        await opened;
        assert(socket.connected, "OPEN did not establish a native connection");
    };
    assert(socket instanceof Laya.Socket && !socket.connected, "module should initialize an idle native Socket");
    assert(typeof lx.http.request === "function" && lx.net === socket, "HTTP and WebSocket entries are not separate");
    const http = await lx.http.request("/__lx_http/200");
    assert(http.data.ok, "HTTP stopped working after the entry migration");
    socket.disableInput = true;
    let childMessages = 0;
    lx.worlds.register({ id: "probe.network", initialize(world) {
        world.listen(socket, Laya.Event.MESSAGE, caller, () => childMessages++);
    } });
    try {
        await connect();
        await lx.worlds.enter("probe.network");
        const textReply = next(Laya.Event.MESSAGE);
        await lx.net.send("native-websocket");
        assert(await textReply === "native-websocket" && childMessages === 1, "text echo or child subscription failed");
        await lx.worlds.exit("probe.network");
        const binaryReply = next(Laya.Event.MESSAGE);
        await lx.net.send(new Uint8Array([1, 4, 9]).buffer);
        const data = await binaryReply;
        assert(data instanceof ArrayBuffer && [...new Uint8Array(data)].join() === "1,4,9", "binary echo changed payload");
        assert(childMessages === 1 && socket.connected, "child exit closed the root socket or retained its listener");
        const closed = next(Laya.Event.CLOSE);
        socket.close();
        await closed;
        await connect();
        socket.on(Laya.Event.MESSAGE, caller, () => childMessages++);
        await lx.stop();
        assert(!socket.connected && !socket.hasListener(Laya.Event.MESSAGE), "root stop retained connection or consumers");
        let retired = false;
        try { lx.net; } catch { retired = true; }
        assert(retired, "retired network module remains accessible");
        await globalThis.$_main_();
        assert(lx.net !== socket && !lx.net.connected, "fresh root reused a retired connection");
        return { passed: true, nativeSocket: true, idleByDefault: true, httpIndependent: true,
            textAndBinaryEcho: true, childUnsubscribeOnly: true, reconnect: true, rootCleanup: true };
    } finally {
        socket.offAllCaller(caller);
        socket.close();
        if (lx.ready) await lx.worlds.unregister("probe.network");
    }
}
