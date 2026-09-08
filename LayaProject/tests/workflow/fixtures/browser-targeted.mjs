export default function () {
    return `(async () => {
        const button = new globalThis.Laya.GButton();
        let clicks = 0;
        const owner = {};
        const onClick = () => { clicks += 1; };
        try {
            globalThis.Laya.GRoot.inst.addChild(button);
            button.on(globalThis.Laya.Event.CLICK, owner, onClick);
            button.event(globalThis.Laya.Event.CLICK);
            button.offAllCaller(owner);
            button.event(globalThis.Laya.Event.CLICK);
            if (clicks !== 1) throw new Error('Click owner was not isolated.');
            return { passed: true, clicks, ownerRemoved: true };
        } finally { button.destroy(); }
    })()`;
}
