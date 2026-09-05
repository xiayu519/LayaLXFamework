/** Create after Laya initialization; preserve the engine's XHR and event lifecycle. */
export function createEngineHttpRequest(): Laya.HttpRequest {
    return new class extends Laya.HttpRequest {
        protected _onLoad(event: unknown): void {
            const status = Number(this.http.status ?? 200);
            // Laya 3.4.1 only accepts 200/204/0 here. Keep its local-file status 0
            // support, but accept the complete HTTP success range as well.
            if (status === 0 || (status >= 200 && status < 300)) {
                this.complete();
            } else {
                super._onLoad(event);
            }
        }
    }();
}
