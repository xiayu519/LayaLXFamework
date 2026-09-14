export type LogStyle = "plain" | "laya-editor" | "css";

/** 进程级日志诊断，不依赖应用的启动与关闭。 */
export class Logger {
    public enabled = true;
    public style: LogStyle = "plain";

    public constructor() {
        // 提取为独立回调后仍可调用，避免每次访问都分配新函数。
        this.log = this.log.bind(this);
        this.error = this.error.bind(this);
    }

    public log(...values: unknown[]): void {
        if (!this.enabled) {
            return;
        }
        if (this.style === "css" && typeof values[0] === "string") {
            values[0] = "%c" + values[0];
            values.splice(1, 0, "color:#ffd54f");
        } else if (this.style === "laya-editor") {
            for (let index = 0; index < values.length; index++) {
                const value = values[index];
                if (typeof value === "string") {
                    values[index] = "[color=#ffd54f]" + value.replace(/\[/g, "\\[") + "[/color]";
                }
            }
        }
        console.log(...values);
    }

    public error(...values: unknown[]): void {
        if (this.enabled) {
            console.error(...values);
        }
    }
}

/** xlog 与兼容入口 lx.logger 共用此实例。 */
export const logger = new Logger();
