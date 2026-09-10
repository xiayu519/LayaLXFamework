# World 与场景

`lx.worlds` 协调业务世界的初始化和卸载；`lx.scenes` 持有原生场景实例；每个 `BaseGameScene` 持有自己的 `scene.ui`。World 保存注册撤销和清理回调，不保存 UI 实例、不创建 UI 宿主，也没有 `world.ui`。

## 注册与进入 World

应用组合根准备公共 UI 与 World 定义，框架 AppBootstrap 启动公共服务；注册仅准备描述数据，不等于加载。进入 World 时才初始化其专属 UI、Scene 和事件，退出只清理自身内容。账号数据与协议接收不依赖 World，登录数据可以在任何界面打开前落地。以下为专属内容的组合根片段：`context` 为 `RuntimeContext`，`battleScene` 与 `battleHud` 是游戏已声明的场景和 UI 路由，包含各自的资源地址及所需 bind；场景 Runtime 负责打开对应的 HUD。

```ts
context.worlds.register({
    id: "battle",
    async initialize(world) {
        const hud = context.ui.registerView(battleHud);
        world.own(() => context.ui.unregisterView(hud));

        const scene = context.scenes.register(battleScene);
        world.own(() => context.scenes.unregister(scene));

        // 先登记撤销，再开始异步工作；原始 Promise 必须返回/等待。
        await context.scenes.open(scene, { levelId: 1 }, { signal: world.signal });
    },
});
await context.worlds.enter("battle");
```

`WorldContext` 只有 `id`、`signal` 和 `own(cleanup)`。初始化自己的内容时使用原生 on/off、timer 或各模块注册 API，并立即登记撤销动作。回调逆序执行：先停止最后注册的副作用，再卸载场景，最后撤销专属 UI 定义。公共定义不交给 world.own；公共 UI 的实例仍由打开它的 Scene 或父窗口清理。两个 World 先退出再进入时，可以重新使用同一 Prefab；复用资源不等于共用实例。

`enter(id)` 合并同一 World 的并发初始化；`get(id)` 只返回已完成初始化的活动 World 上下文。不同 World 可以共存，不隐含“当前 World”。`exit(id)` 取消初始化、运行已登记的清理，并等待原始初始化和晚到清理完成；晚到 own 会立即进入清理。初始化失败执行同样的补偿；清理失败保留诊断并阻止该条目重新进入。

`exit` 保留 World 定义，允许正常退出后重新 enter；`unregister` 在退出后撤销定义。普通切换流程可写为：

```ts
await lx.worlds.exit("lobby");
await lx.worlds.enter("battle");
```

顺序由游戏导航业务决定；示例把并发点击合并在应用组合处。不要在将退出的 UI 内持有整段切换任务，也不要在初始化里调用并等待自身 exit。示例见 [registerExampleWorlds.ts](../src/game/logic/bootstrap/registerExampleWorlds.ts)。

## 多场景与显式归属

每个 Scene route 管理一个当前实例；不同 route 可以同时存在。重新 open 同一 route 只替换该 route 的实例，不关闭其他 route。内部 `SceneFlow` 复用加载、失效和回收事务；公共入口为 `lx.scenes`。

```ts
// SceneRoute 从 framework/presentation/scene/SceneFlow 以 import type 引入。
const battle: SceneRoute<BattleArgs> = { id: "battle.scene", url: "game/scenes/Battle.ls" };

lx.scenes.register(battle);
const scene = await lx.scenes.open(battle, { levelId: 1 });
lx.scenes.get(battle);         // 已就绪的实例；加载、卸载期间可能为 undefined。
lx.scenes.get("battle.scene");
await lx.scenes.close(battle); // 卸载实例和待完成加载，保留定义。
await lx.scenes.unregister(battle); // 撤销定义；通常由 World 的 own 调用。
```

保存 register 返回的 route，或使用原注册对象，才能保留参数类型与注册身份。旧注册对象不能卸载后来同 ID 的新注册。字符串入口没有相同的参数类型检查。

没有全局 current 场景猜测。`scene.ui` 始终属于左侧的实例；需要哪个场景，就通过对应 route 或 ID 获取。普通独立 Scene 直接使用 `Laya.Scene`，不需要额外原生别名。

## 场景脚本与 UI 宿主

.ls 根节点 Runtime 继承 `BaseGameScene<TArgs>`。在 IDE 内为场景中的 GWidget 命名 uiRoot，并勾选 Export Var（源资产 _$var:true）；它与 Area2D 并列，处于屏幕坐标空间，不受战斗摄像机影响。第一次使用 scene.ui 时连接该宿主；缺少或错误引用会明确报错，不按节点名字猜测。

```ts
const scene = lx.scenes.get("battle.scene");
if (scene) {
    scene.ui.setViewport({ x: 40, y: 60, width: 640, height: 1000 });
    scene.ui.root.zOrder = 10;
    scene.ui.setViewport(); // 恢复全屏跟随。
}
```

坐标采用 Laya Stage 逻辑单位；宿主祖先保持无变换的屏幕坐标空间。宿主不重复扣安全区，安全区只应用在窗口骨架的 safeContent 内。全屏页面、HUD、场景独立弹窗都归该宿主；跨场景 Loading 等应用窗口进入原生 GRoot。

场景在 onPrepare(context) 内可通过 `this.ui.show(route, context.args, { signal: context.signal })` 打开 UI，也可在 onWaitUntilReady(context) 等待首屏展示。根 Runtime、节点导出和静态 UIViewLifecycle 来自 .lh，注册只声明 id/url，需要额外依赖注入时增加 bind。场景销毁清理可见、隐藏缓存、父展示子 UI 和待加载，再等待异步收尾。详见 [UI 布局与归属](ui-layout.md)。

## 加载事务与附加资源

每个 route 的打开顺序为：显示 Loading，清理该 route 的旧场景，等待原生销毁稳定，在安全边界执行 Laya.Scene.gc，加载 .ls 与其依赖，加载 describeResources(args) 的附加资源，执行 onPrepare，使用原生 open(false, args) 打开，等待 onWaitUntilReady，提交实例并报告 ready。

不调用全局 closeAll。有其他场景正在切换或清理失败时，局部回收边界避免提前执行全局 GC；应用停机统一等待所有 owner 稳定。先退出大厅 World 再进入战斗 World，才能在加载战斗前回收大厅；两个 World 并存是显式选择，不能同时宣称其内存已经回收。

describeResources 只声明由参数、配置或关卡数据动态选择、且必须在显示前就绪的附加资源。.ls/.lh 已声明的依赖不重复列出；它也不是逐项卸载清单。资源从 onPrepare 起消费，不在构造或反序列化期间假设动态资源已就绪。

```ts
protected override describeResources(args: BattleArgs) {
    return [{ url: "game/levels/" + args.levelId + ".json", type: Laya.Loader.JSON }];
}

protected override async onPrepare(context: ScenePhaseContext<BattleArgs>) {
    await this.ui.show("battle.hud", context.args, { signal: context.signal });
}
```

生命周期钩子 onTransitionPause/onTransitionResume/onTransitionLeaving 用于离场副作用；同步清理用场景 own，待加载资源使用 context.signal 或 scene.signal。旧场景进入最终释放后不承诺回滚；新场景失败会销毁半成品并保留 Loading 失败状态，可再次 open 重试或进入兜底场景。

连续打开同 route、World 退出或外部取消会使旧请求失效。框架结束调用方等待后，仍追踪不可取消的原生加载和 UI bind Promise，晚到结果不能覆盖新实例。close/unregister 等待这部分工作；不能以显示树消失作为资源已全部释放的证据。

## Loading 与诊断

showLoading 和 autoCloseLoading 默认 true。示例应用通过 createSceneLoadingPresenter 提供 UILayer.System 的单例 GWindow；具体 Prefab、Runtime 和展示实现均归游戏。没有提供 presenter 时框架不创建 Loading，场景流程仍可运行。多个场景请求共用一个展示，关闭某个场景的 Loading 不影响其他仍在进行的请求。

框架报告 cleanup/scene/resources/prepare/switch/ready 阶段与总进度。`autoCloseLoading:false` 时由该次场景调用 completeTransitionLoading；它至少等待 ready 后生效，旧实例的请求不能关闭新请求的 Loading。具体展示可通过应用 createSceneLoadingPresenter 配置。

`lx.scenes.snapshot()` 查看已注册 route、已加载实例、待完成切换和清理失败；`lx.worlds.snapshot()` 查看定义、初始化、待清理与失败。`lx.snapshot()` 汇总这些状态及 UI、池和配置。失败保持可观察，不用强制 reset 跳过未完成卸载。

## 当前示例与验证范围

启动时模拟登录先填充账号库存，然后进入 examples.lobby；大厅场景为 Lobby.ls，主页为 lx.status。点击“进入战斗”退出大厅 World 并进入 examples.battle，场景为 Battle.ls，页面为 lx.examples.battle；战斗页返回大厅。补给数据由外层账号持有，切换不清空库存或尚未到账的奖励。

相关验证应覆盖 World 并发初始化/取消/逆序清理、同 route 替换、不同 route 并存、场景 UI 归属、未完成加载与错误诊断。单纯生命周期修改不附带分辨率矩阵；只有宿主、布局或节点几何改变时验证受影响尺寸。自动验证的本轮结果以交付报告为准，本文不把命令列表视为通过证据。
