import type { WorldContext, WorldDefinition } from "./WorldDefinition";

/** 提供业务扩展点；生命周期与清理由 WorldRegistry 统一调度。 */
export abstract class BaseWorld<TContext extends WorldContext = WorldContext> implements WorldDefinition<TContext> {
    public abstract readonly id: string;

    /** 由 WorldRegistry 调用；子类重写扩展钩子，不重写此调度方法。 */
    public async initialize(context: TContext): Promise<void> {
        // 先移除本 World 持有的注册项，再执行最终业务清理。
        // 注册或进入过程部分失败时，也会通过此钩子清理。
        context.own(() => this.onExit(context));
        await this.onRegister(context);
        if (!context.signal.aborted) {
            await this.onEnter(context);
        }
    }

    /** 编排子类的 registerEvents、registerUI、registerScenes；通过 WorldScope 登记退出清理。 */
    protected abstract onRegister(context: TContext): void | Promise<void>;

    /** 打开场景并启动业务；依赖场景的逐帧任务应在场景准备完成后启动。 */
    protected abstract onEnter(context: TContext): void | Promise<void>;

    /**
     * 退出时执行一次业务收尾；已登记内容由框架逆序清理，不必重复销毁。
     * 初始化中途退出也会调用；取消后才完成的异步工作仍需自行检查 signal。
     */
    protected onExit(_context: TContext): void | Promise<void> {
    }
}
