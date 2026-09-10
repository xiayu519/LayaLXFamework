# SceneFlow 使用

`lx.sceneFlow` 是业务场景切换事务入口，`lx.scene` 仍保持为原生 `Laya.Scene`。框架默认显示常驻 Loading，先回收旧业务场景，再统一加载场景层级、附加资源并完成新场景初始化，从而控制切换期间的峰值内存。

## 注册

在应用组合处把场景加入内容目录并注册 route；原生 `AppEntry.main()` 启动应用，场景切换不会停止应用：

```ts
import type { SceneRoute } from "../../framework/presentation/scene/SceneFlow";

export interface BattleSceneArgs {
    readonly levelId: number;
    readonly heroSkin: string;
    readonly manualLoading?: boolean;
}

export const BATTLE_SCENE_ROUTE: SceneRoute<BattleSceneArgs> = {
    id: "battle",
    url: "game/scenes/Battle.ls",
};

createRuntime({
    content: [
        { id: BATTLE_SCENE_ROUTE.id, url: BATTLE_SCENE_ROUTE.url, kind: "scene" },
    ],
    configureSceneFlow(sceneFlow): void {
        sceneFlow.register(BATTLE_SCENE_ROUTE);
    },
});
```

保留 `register()` 返回的 route 可获得 `args` 编译期检查。若重新创建对象后再调用 `open(route, ...)`，它不是已注册的同一个 route；应保存并使用 `register()` 的返回值，或按 route id 调用。

## 场景脚本

`.ls` 根节点 Runtime 继承 `BaseGameScene`。字段交给 IDE 生成或使用原生属性引用，不在构造函数访问尚未反序列化的节点。层级自身引用的图片、Prefab、Spine 等由 Laya `HIERARCHY` 加载统计进 `scene` 阶段；这里只声明运行时才能决定的附加资源：

```ts
import {
    BaseGameScene,
    type ScenePhaseContext,
    type SceneResourceRequest,
} from "../../framework/presentation/scene/BaseGameScene";

export class BattleScene extends BaseGameScene<BattleSceneArgs> {
    protected override describeResources(args: BattleSceneArgs): readonly SceneResourceRequest[] {
        return [
            { url: `game/skins/${args.heroSkin}.lh`, type: Laya.Loader.HIERARCHY },
            { url: `game/levels/${args.levelId}.json`, type: Laya.Loader.JSON },
        ];
    }

    protected override async onPrepare(context: ScenePhaseContext<BattleSceneArgs>): Promise<void> {
        context.reportProgress(0.25);
        // 解析已加载的数据、创建战斗模型；异步步骤应检查 context.signal。
        context.reportProgress(1);
    }

    protected override async onWaitUntilReady(
        context: ScenePhaseContext<BattleSceneArgs>,
    ): Promise<void> {
        // 可在这里等待对象池预热、首屏角色创建等；Loading 仍覆盖新场景。
        await this.warmBattlePools(context.signal);
        context.reportProgress(1);

        // 只有调用 open() 时设置 autoCloseLoading: false 才需要主动完成。
        if (context.args.manualLoading) this.completeTransitionLoading();
    }

    protected override onTransitionPause(): void {
        // 暂停输入、Timer、Tween 等可见副作用。
    }

    protected override onTransitionResume(): void {
        // 仅在旧场景尚未进入销毁前，切换被取消或失败时恢复。
    }

    protected override async onTransitionLeaving(): Promise<void> {
        // Loading 已显示；停止输入、Timer、Tween，归还 active 对象并排空场景池。
        await this.releaseBattleObjects();
        lx.pool.drain("battle-unit");
    }

    private async warmBattlePools(_signal: AbortSignal): Promise<void> {
        // 示例占位：这里实现当前项目的对象池预热。
    }

    private async releaseBattleObjects(): Promise<void> {
        // 示例占位：先把 active 实例逐个 lx.pool.release()，再允许 drain()。
    }
}
```

`describeResources()` 的返回值只参与加载，不代表独占所有权，也不会被逐项强制卸载。节点和显示命令销毁、异步回写失效并稳定一帧后，由 `Laya.Scene.gc()` 按真实引用回收；禁止调用私有引用 API。

## 打开与进度

```ts
await lx.sceneFlow.open(BATTLE_SCENE_ROUTE, {
    levelId: 12,
    heroSkin: "knight",
    manualLoading: false,
}, {
    // 两项都默认 true，通常无需填写。
    showLoading: true,
    autoCloseLoading: true,
    signal: abortController.signal,
    onProgress(progress) {
        console.log(progress.phase, progress.scene, progress.resources, progress.overall);
    },
});
```

默认情况下，成功返回时旧场景早已销毁并完成一次场景级 GC，新场景已经提交，Loading 显示过 `100%` 并在下一帧隐藏。`onPrepare()` 或 `onWaitUntilReady()` 返回的 Promise 都属于切换事务，最常见的对象池预热只要在其中 `await`，无需手动管理 Loading。

确实需要场景自己结束 Loading 时这样调用：

```ts
await lx.sceneFlow.open(BATTLE_SCENE_ROUTE, {
    levelId: 12,
    heroSkin: "knight",
    manualLoading: true,
}, {
    autoCloseLoading: false,
});
```

上例的 `completeTransitionLoading()` 即使在 `onWaitUntilReady()` 内较早调用，也只记录完成请求；框架仍会先提交场景并报告 `ready: 100%`，随后才真正关闭。若场景选择在 `open()` 返回后的其他业务时机调用也可以；一旦新切换开始或该场景销毁，旧完成回调自动失效。

Loading 显示或旧场景暂停阶段失败时，旧场景尚在，框架会恢复旧场景并隐藏 Loading。一旦开始最终销毁旧场景，就不再提供回滚：新层级、附加资源或初始化失败会使 Promise reject、销毁新场景半成品，并保留显示“加载失败，请重试”的 Loading；再次调用 `open()` 会复用该 Loading 进入重试或兜底场景。错误可从 `lx.snapshot().scenes.lastError` 诊断。

## UI 与摄像机

`scene.ui` 始终属于左侧这个场景实例，不会自动转到当前场景。需要当前场景时显式读取 `lx.sceneFlow.current`，切换中它可能为空。SceneFlow 编排一个主业务场景槽位，不自动管理任意并存原生 Scene 的业务寿命。

```ts
const scene = lx.sceneFlow.current;
if (scene) {
    scene.ui.setViewport({ x: 20, y: 30, width: 680, height: 1100 });
    scene.ui.root.zOrder = 20;
    // 恢复全屏跟随：scene.ui.setViewport();
}
```

setViewport 使用 Stage 逻辑坐标，安全区裁剪/转换为宿主局部坐标；窗口和 mask 跟随宿主，zOrder 不被布局覆盖。祖先须为无位移/缩放/旋转的屏幕空间节点，根的位置由 setViewport 设置。直接改 root.x/y 会在下一次布局重设；世界摄像机节点不适合作为宿主。

场景异步借用可用 `await lx.pool.acquire(id, { signal: this.signal })`。返回后先检查场景是否仍有效，已失效则立即归还；有效时登记 `own(() => lx.pool.release(id,node))` 再挂载。this.signal 在最终离场和直接 destroy 时取消，可逆 pause/resume 不取消；它与准备阶段 context.signal 的范围不同。参见 [异步资源生命周期](ui-resource-lifecycle.md)。


需要 UI 的场景在 `.ls` 中声明 GWidget，原生导出变量 uiRoot（`_$var: true`），或在首次访问 ui 前把其他原生导出节点赋给 this.uiRoot。默认用场景直接子节点，铺满 Stage 并允许空白穿透；也可放在无变换的屏幕空间父节点下。框架验证宿主属于该场景，不凭名字猜节点，不自动生成宿主。`SceneFlow` 在准备阶段之前接入场景 UI，业务通过 `this.ui` 使用；没有 UI 的场景不创建上下文。不要在场景构造函数访问 this.ui，也不在每个场景手写一个管理器。

```text
BattleScene
├─ Area2D
│  ├─ Camera2D
│  └─ 战斗世界
└─ uiRoot (GWidget)
   ├─ HUD / 页面 (原生 GWidget Runtime)
   ├─ 场景或父展示拥有的弹窗 (原生 GWidget Runtime)
   └─ 宿主局部 Mask（动态排在最高模态窗口正下方）

GRoot
└─ 应用拥有的 Loading / 系统窗口 (原生 GWindow)
```

场景页面、HUD 和弹窗统一在组合处 `ui.registerView({ id, url, viewType, bind })` 注册，viewType 是 `.lh` 的 GWidget Runtime，layout 支持 fullscreen/safe-screen/center-popup。场景调用 `await this.ui.show(route,args,{signal:context.signal})`。`bind(view,args,session)` 内直接使用 IDE 生成字段；session.close() 关闭本次展示，session.lifetime 登记展示期清理，session.token 防止异步表现回写旧页面。

owner、host、layout 独立：场景弹窗也挂 uiRoot。`session.show()` 打开的子 UI 归当前展示，父关闭自动清理其可见、隐藏缓存和待加载；`session.ui.show()` 打开的独立 UI 归场景，父关闭不影响它。singleton 按 owner 隔离，hide 只在 owner 存活期间复用。场景离场取消请求、结束订阅并销毁全部所属 UI，不能只靠销毁 uiRoot 清理已脱离显示树的缓存。

`session.bindData` / `bindRedDot` 管理展示期订阅，暂停时解除、恢复时读取最新模型快照。服务器同步和业务结果属于服务/模型，窗口离开不能阻止它们落地，见 [数据绑定](ui-data-binding.md)。其他 Timer、Tween 和业务对象仍由 `own()` 或离场钩子清理。

Loading 固定在 `UILayer.System`，应用级网络提示等可直接使用 `lx.ui`。这些 UI 不随业务场景离场；应用停机调用 `await lx.stop()`。2D 摄像机只作用于 Area2D 中的世界，HUD 放同级 uiRoot，不需要 UICamera，也不为每个场景创建 GRoot。

如需品牌化 Loading，可在 `createSceneLoadingPresenter(ui, content)` 返回自己的 `SceneLoadingPresenter`。它仍应使用 `UILayer.System`，并让 `show/update/fail/hide` 可承受连续请求和晚到完成。
