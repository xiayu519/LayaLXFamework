# World 时间与网络接入

## Laya 原生依据与选择

固定基线为 LayaAir 3.4.1 commit `f368b43098fe6bde7b961546114e71907c5f8a98`。本机安装包 Timer、Script、Socket 源码均已与该 commit 对照一致。

Laya 支持 Script.onUpdate，也支持无节点对象通过 Laya.timer.frameLoop 注册逐帧任务；没有“不推荐 Update”的官方结论。官方 Timer 文档明确建议通过 Laya.timer 访问，不手动创建 Timer。虽然构造器在源码中允许自动接入系统 timer，这不等于需要为每个 World 创建 Timer。[官方 Timer 文档](https://layaair.com/3.x/doc-en/basics/common/Timer/readme.html)、[固定 Script 源码](https://github.com/layabox/LayaAir/blob/f368b43098fe6bde7b961546114e71907c5f8a98/src/layaAir/laya/components/Script.ts)、[固定 Timer 源码](https://github.com/layabox/LayaAir/blob/f368b43098fe6bde7b961546114e71907c5f8a98/src/layaAir/laya/utils/Timer.ts)。

本项目因此采用：**需要逐帧运行的 World 自己登记一个原生 frameLoop 回调，所有 World 共用 Laya.timer；框架不增加全局 Update 分发器。** 没有逐帧任务的 Lobby/World 不登记空回调。已有节点组件使用 onUpdate 也符合原生用法，不为普通 World 额外挂载节点。

## BattleWorld 的 1 倍、2 倍和暂停

倍速属于本场战斗，传给战斗领域逻辑的时间为 `Laya.timer.unscaledDelta * timeScale`（毫秒）。不用修改全局 Laya.timer.scale，因此不会把大厅 UI、其他 World、全局红点表现和网络重试一起加速。这个选择是项目针对 World 隔离的设计，不声称是 Laya 统一的 World 规范。

以下为实际 API 的业务接入方式；`battle.step` 表示具体游戏已有的战斗运算入口，示例脚本库当前只有 UI 演示，因此不人为添加空跑循环：

```ts
class BattleWorld extends BaseWorld<WorldScope> {
    public readonly id = "battle";
    private timeScale = 1;

    public constructor(private readonly battle: { step(deltaMs: number): void }) {
        super();
    }

    public setTimeScale(value: number): void {
        if (!Number.isFinite(value) || value < 0) {
            throw new Error("Battle time scale must be finite and nonnegative.");
        }
        this.timeScale = value;
    }

    protected override onRegister(world: WorldScope): void {
        world.ownCaller(this);
        // 按实际游戏登记资源、模块、UI 与 Scene。
    }

    protected override onEnter(): void {
        // 若需先加载 Scene，应等待打开并检查 signal 后再启动逐帧任务。
        Laya.timer.frameLoop(1, this, this.onFrame);
    }

    protected override onExit(): void {
        // ownCaller 已使框架在退出开始时 clearAll(this) 和 killAll(this)。
        // 此处只清理本场战斗自己的状态，不必重复删除同一个 frameLoop。
        this.timeScale = 1;
    }

    private onFrame(): void {
        if (this.timeScale > 0) {
            this.battle.step(Laya.timer.unscaledDelta * this.timeScale);
        }
    }
}
```

- 战斗内冷却、技能时间等通过相同的模拟 delta 推进；Laya.timer.once 的真实等待不会自动跟随这个局部倍速。服务器发货、账号权益等以服务器时间/结果为准。
- 暂停用本场 timeScale=0；退出时 WorldScope 清理登记 caller 的 frameLoop 和 Tween。不要通过全局 Laya.timer.pause() 暂停一场战斗。
- `onRegister` 登记持有与清理责任；循环可以按业务需要启动，依赖 Scene 的循环通常在 `onEnter` 等待 Scene 就绪后启动。`await lx.worlds.exit(id)` 会执行这些清理。
- `callLater` 使用独立队列，普通 `clearAll(this)` 不会清掉它。使用时同时登记 `world.own(() => Laya.timer.clearCallLater(this, this.refresh))`，退出后异步代码仍需检查 `world.signal`。[3.4.1 Timer 源码](https://github.com/layabox/LayaAir/blob/v3.4.1/src/layaAir/laya/utils/Timer.ts)
- Sprite/Spine/Animator/Tween 的播放速率分别使用对应原生组件 API；计算逻辑倍速不代表所有动画自动调速。社区官方答复也说明骨骼 playbackRate 与全局 timer.scale 不是同一件事，并提示引擎 delta 上限。[社区官方倍速说明](https://ask.layaair.com/d/53654-Laya-2-x-3-x-yan-shi-xiang-mu-zhong-Laya-timer-scale-he-Laya-SpineSkeleton-playbackRate-dui-bu-fen-gu-ge-jia-su-bu-sheng-xiao)
- 固定步长、追帧上限、后台恢复和服务器校时由具体战斗规则决定；本轮不提前新增通用调度器。实际倍速和暂停隔离由 [原生时间探针](../tests/framework/world-time.browser.mjs) 验证，未据此宣称验证了完整战斗、物理或所有动画组件。

## HTTP 与 WebSocket

| 用途 | 入口 | 生命周期 |
| --- | --- | --- |
| HTTP 请求/响应、取消、超时、有限重试 | `lx.http.request(...)` | 每个请求自己的 signal 与超时 |
| WebSocket 原生连接、字节和事件 | `lx.net` | 根初始化，根停止时关闭 |
| 子 World 监听网络事件 | `world.listen(lx.net, ...)` | 子 World 退出解绑，连接继续存在 |

HTTP 统一使用 `lx.http.request(...)`；旧 `lx.net.request(...)` 调用方升级时需改名。`lx.net` 现在专用于 WebSocket，直接返回原生 Laya.Socket，不再要求调用者访问中间的 socket 属性。私有 NetworkService 只负责根生命周期中的初始化与关闭，不转发原生方法，也不新增消息缓存或协议路由。[实现](../src/framework/infrastructure/network/NetworkService.ts)

Laya.Socket 已提供 connectByUrl、send、input/output Byte 和 OPEN/MESSAGE/CLOSE/ERROR。需要先登记事件，再连接，收到 OPEN 后才能收发。OPEN 只代表通道建立，不能完成根的首次数据同步任务。[固定 Socket 源码](https://github.com/layabox/LayaAir/blob/f368b43098fe6bde7b961546114e71907c5f8a98/src/layaAir/laya/net/Socket.ts)、[社区实际问题与答复](https://ask.layaair.com/d/11808-socket-tong-xun-fan-hui-shu-ju)

```ts
world.listen(lx.net, Laya.Event.MESSAGE, this, this.onMessage);
// 连接动作由根的会话/首次同步模块负责，不能在每次进小 World 时重复连接。
// lx.net.connectByUrl(configuredServerUrl);
// 收到原生 OPEN 后：await lx.net.send(payload);
```

lx.net.on/off/connectByUrl/send/close 以及 input/output 都是同一个原生 Socket 的能力。默认不连接；根停止后 lx.net 拒绝访问已退役连接，下一次初始化提供新的 Socket。服务端地址、认证、心跳、重连策略、消息 schema 与完整首包标记均待具体协议接入。文本模式可按原生建议设置 disableInput=true；二进制缓存和 endian 由协议决定，不擅自固定 JSON 或字节序。

手动重连先结束旧连接并等待其 CLOSE，再 connectByUrl；本版不把交叠连接包装成自动重连，也不保证旧连接与新连接的消息顺序。

根停止时先关子 World，再停全局接收器与 network。NetworkService 清理应用监听、原生关闭连接并清空 Byte 缓冲。3.4.1 的 PAL 关闭仍可晚到 ERROR/CLOSE；退役 Socket 只保留无业务引用的 ERROR 吸收函数与 CLOSE 清理函数，避免晚到回调进入旧模型或产生主动关闭的误报。没有使用私有 socket 字段或弃用的 cleanSocket。

本地 Headless 回显验证见 [WebSocket 探针](../tests/framework/network.browser.mjs)。它证明原生 Web Socket 集成和 root/World 清理，不代替真实服务器、小游戏 PAL、Native、TLS、断线重连或 IAP 权益验收。
