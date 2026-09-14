/** 框架公共事件名称；通过 lx.events 的原生事件接口订阅和派发。 */
export class FrameworkEvent {
    /** 全局模块与首次数据同步完成，尚未自动进入初始 World；无参数。 */
    public static readonly READY = "lx:ready";

    /** 框架开始关闭，在子 World 失效和模块清理之前派发；不代表关闭已完成。 */
    public static readonly STOPPING = "lx:stopping";

    private constructor() {
    }
}
