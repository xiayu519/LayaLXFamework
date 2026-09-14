/** 在真实引擎内验证根支付生命周期；渠道和订单状态仅由本探针控制。 */
export default function purchaseProbe() {
    return `(async () => {
        const assert = (value, message) => { if (!value) throw new Error("Purchase probe: " + message); };
        const until = async predicate => {
            const end = Date.now() + 5000;
            while (!predicate()) {
                if (Date.now() > end) throw new Error("Purchase probe timed out");
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        };
        const key = "lx.probe.purchase." + Date.now();
        const dataKey = { id: "probe.purchase.account" };
        const account = { gems: 0, disposed: false };
        let serverGems = 0, order, listener, releasePayment, finishes = 0, starts = 0, stops = 0;
        let localEvents = 0, globalEvents = 0, queries = 0, widget, firstSync = false;
        const changed = "lx:purchase:changed";
        const channel = {
            start(callback) { listener = callback; starts++; },
            stop() { listener = undefined; stops++; },
            launch() { return new Promise(resolve => { releasePayment = resolve; }); },
            async finish() { assert(account.gems === 10, "confirmation preceded synchronized account data"); finishes++; }
        };
        const synchronizeAccount = () => {
            assert(!account.disposed, "late payment wrote disposed account data");
            account.gems = serverGems;
            lx.redDots.set("probe.purchase", account.gems > 0 ? 1 : 0);
        };
        const backend = {
            async createOrder(request) {
                order = { accountId: request.accountId, requestId: request.requestId, productId: request.productId,
                    orderId: "probe-order", revision: 0, status: "awaiting-payment", confirmation: "none" };
                return { order };
            },
            async reportAttempt() {
                order = { ...order, revision: 1, status: "awaiting-delivery" };
                return order;
            },
            async verifyTransaction() { synchronizeAccount(); return order; },
            async reconcile() {
                queries++;
                assert(firstSync, "purchase reconciliation preceded account binding and first snapshot");
                synchronizeAccount();
                return order ? [order] : [];
            }
        };
        await lx.stop();
        try {
            await lx.init({ tipPrefabUrl: "bootstrap/ui/UITip.lh", purchase: { channel, backend, storageKey: key },
                data: [{ key: dataKey, value: account }], initialWorld: "purchase-probe",
                register() {
                    lx.events.on(changed, account, () => { globalEvents++; });
                    lx.worlds.register({ id: "purchase-probe", initialize(world) {
                        widget = new Laya.GWidget();
                        world.own(() => widget.destroy());
                        world.listen(lx.events, changed, widget, () => { localEvents++; });
                    } });
                },
                synchronization: { source: "purchase-probe", async synchronize() {
                    assert(starts === 1, "payment listeners were not initialized");
                    lx.purchase.setAccount("probe-account");
                    firstSync = true;
                } },
                dispose() { assert(stops === 1, "account disposed before payment stopped"); account.disposed = true; }
            });
            assert(lx.ready && queries === 1, "initial payment reconciliation was not integrated");
            const buying = lx.purchase.buy("gems");
            assert(lx.purchase.buy("gems") === buying, "double click launched another purchase");
            await until(() => releasePayment !== undefined);
            assert(localEvents > 0, "World did not receive its payment subscription");
            await lx.worlds.exit("purchase-probe");
            const exitedEvents = localEvents;
            assert(widget.destroyed && stops === 0, "World exit stopped payment or retained its UI owner");
            releasePayment({ status: "submitted" });
            const waiting = await buying;
            assert(waiting.status === "awaiting-delivery" && account.gems === 0, "SDK result granted rewards");
            serverGems = 10;
            order = { ...order, revision: 2, status: "delivered", confirmation: "required",
                transaction: { channel: "probe", transactionId: "probe-transaction" } };
            const transaction = { ...order.transaction, accountId: order.accountId, productId: order.productId, orderId: order.orderId };
            listener(transaction);
            listener(transaction);
            await until(() => lx.purchase.getOrder(order.orderId)?.confirmation === "complete");
            assert(localEvents === exitedEvents && globalEvents > localEvents, "World listener survived or root listener was removed");
            assert(lx.data.get(dataKey) === account && account.gems === 10 && finishes === 1, "global account or confirmation changed");
            const beforeResume = queries;
            Laya.stage.event(Laya.Event.FOCUS);
            lx.net.event(Laya.Event.OPEN);
            await until(() => queries > beforeResume);
            await lx.purchase.reconcile();
            assert(finishes === 1, "reconciliation repeated a completed confirmation");
            const lateListener = listener;
            await lx.stop();
            const stoppedQueries = queries;
            Laya.stage.event(Laya.Event.FOCUS);
            lateListener(transaction);
            await new Promise(resolve => setTimeout(resolve, 20));
            assert(queries === stoppedQueries && stops === 1 && account.disposed, "root cleanup retained payment effects");
            assert(lx.purchase.snapshot().pendingOperations === 0, "payment operations did not settle");
            return { passed: true, initializedOnce: true, worldExitDuringPayment: true, nativeOwnerDestroyed: true,
                rootAccountPreserved: true, sdkDidNotGrant: true, duplicateConfirmationPrevented: true,
                nativeResume: true, rootCleanup: true };
        } finally {
            await lx.stop();
            Laya.LocalStorage.removeItem(key + ":probe-account");
            await globalThis.$_main_();
        }
    })()`;
}
