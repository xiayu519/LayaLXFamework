import type { AppService } from "../../application/lifecycle/AppService";

/** 根 World 持有 WebSocket；连接、字节读写与事件均使用原生 Socket API。 */
export class NetworkService implements AppService {
    public readonly name = "network";
    private current: Laya.Socket | undefined = new Laya.Socket();

    /** 先订阅，再调用 connectByUrl；OPEN 只表示连接就绪，不代表首次数据同步完成。 */
    public get socket(): Laya.Socket {
        if (!this.current) {
            throw new Error("NetworkService has stopped.");
        }
        return this.current;
    }

    public start(): void {
        // 注册模块不会发起连接；服务器 URL 和协议由游戏的首次同步流程决定。
        if (!this.current) {
            throw new Error("NetworkService has stopped.");
        }
    }

    public stop(): void {
        const socket = this.current;
        if (!socket) {
            return;
        }
        this.current = undefined;
        socket.offAll();
        // 3.4.1 异步关闭时仍会收到 PAL 回调；先释放游戏和根 World 的 caller，
        // 只保留对已停用 Socket 的错误处理，收到原生 CLOSE 后再移除这些监听。
        socket.on(Laya.Event.ERROR, null, NetworkService.ignoreRetiredError);
        socket.once(Laya.Event.CLOSE, socket, socket.offAll);
        socket.close();
        socket.input.clear();
        socket.output.clear();
    }

    private static ignoreRetiredError(): void {
    }
}
