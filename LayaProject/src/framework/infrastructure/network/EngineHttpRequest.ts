/** 在 Laya 初始化后创建，沿用引擎的 XHR 与事件生命周期。 */
export function createEngineHttpRequest(): Laya.HttpRequest {
    class EngineHttpRequest extends Laya.HttpRequest {
        protected override _onLoad(event: unknown): void {
            const status = Number(this.http.status ?? 200);
            // Laya 3.4.1 此处仅接受 200/204/0；保留本地文件状态码 0 的支持，
            // 同时接受完整的 HTTP 成功状态码范围。
            if (status === 0 || (status >= 200 && status < 300)) {
                this.complete();
            } else {
                super._onLoad(event);
            }
        }
    }
    return new EngineHttpRequest();
}
