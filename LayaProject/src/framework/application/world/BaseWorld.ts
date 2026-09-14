import type { WorldContext, WorldDefinition } from "./WorldDefinition";

/** 提供业务扩展点；生命周期与清理由 WorldRegistry 统一调度。 */
export abstract class BaseWorld<TContext extends WorldContext = WorldContext> implements WorldDefinition<TContext> {
    public abstract readonly id: string;

    /** 由 WorldRegistry 调用；子类重写扩展钩子，不重写此调度方法。 */
    public async initialize(context: TContext): Promise<void> {
        // 先移除本 World 持有的注册项，再执行最终业务清理。
        // 注册或进入过程部分失败时，也会通过此钩子清理。
        context.own(() => this.onExit(context));
        // 公共顺序只在父类维护；子类只提供各阶段内容，取消后不再执行后续阶段。
        const steps = [this.onRegister, this.registerEvents, this.registerUI, this.registerScenes, this.onEnter];
        for (const step of steps) {
            if (context.signal.aborted) {
                return;
            }
            await step.call(this, context);
        }
    }

    /** 可选准备阶段：先登记局部模块、资源和 caller，再注册依赖它们的事件、UI 与场景。 */
    protected onRegister(_context: TContext): void | Promise<void> {
    }

    /** 只登记本 World 的事件订阅；公共源上的订阅也由本 World 管理寿命。 */
    protected registerEvents(_context: TContext): void | Promise<void> {
    }

    /** 登记本 World 专属 UI 定义；使用 WorldScope 自动绑定退出清理。 */
    protected registerUI(_context: TContext): void | Promise<void> {
    }

    /** 在 UI 定义之后登记场景，保证退出时先销毁场景及其 UI 实例。 */
    protected registerScenes(_context: TContext): void | Promise<void> {
    }

    /** 打开场景并启动业务；依赖场景的逐帧任务应在场景准备完成后启动。 */
    protected abstract onEnter(context: TContext): void | Promise<void>;

    /**
     * 退出时执行一次业务收尾；已登记内容由框架逆序清理，不必重复销毁。
     * 初始化中途退出也会调用；取消后才完成的异步工作仍需自行检查 signal。
     */
    protected onExit(_context: TContext): void | Promise<void> {
    }
}
