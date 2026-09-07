# SceneFlow 使用

`LX.SceneFlow` 是业务场景切换事务入口，`LX.Scene` 仍保持为原生 `Laya.Scene`。框架默认显示常驻 Loading，先回收旧业务场景，再统一加载场景层级、附加资源并完成新场景初始化，从而控制切换期间的峰值内存。

## 注册

在应用组合处把场景加入内容目录并注册 route：

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

`.ls` 根节点脚本继承 `BaseGameScene`。层级自身引用的图片、Prefab、Spine 等由 Laya `HIERARCHY` 加载统计进 `scene` 阶段；这里只声明运行时才能决定的附加资源：

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
        LX.Pool.drain("battle-unit");
    }

    private async warmBattlePools(_signal: AbortSignal): Promise<void> {
        // 示例占位：这里实现当前项目的对象池预热。
    }

    private async releaseBattleObjects(): Promise<void> {
        // 示例占位：先把 active 实例逐个 LX.Pool.release()，再允许 drain()。
    }
}
```

`describeResources()` 的返回值只参与加载，不代表独占所有权，也不会被逐项强制卸载。节点和显示命令销毁、异步回写失效并稳定一帧后，由 `Laya.Scene.gc()` 按真实引用回收；禁止调用私有引用 API。

## 打开与进度

```ts
await LX.SceneFlow.open(BATTLE_SCENE_ROUTE, {
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
await LX.SceneFlow.open(BATTLE_SCENE_ROUTE, {
    levelId: 12,
    heroSkin: "knight",
    manualLoading: true,
}, {
    autoCloseLoading: false,
});
```

上例的 `completeTransitionLoading()` 即使在 `onWaitUntilReady()` 内较早调用，也只记录完成请求；框架仍会先提交场景并报告 `ready: 100%`，随后才真正关闭。若场景选择在 `open()` 返回后的其他业务时机调用也可以；一旦新切换开始或该场景销毁，旧完成回调自动失效。

Loading 显示或旧场景暂停阶段失败时，旧场景尚在，框架会恢复旧场景并隐藏 Loading。一旦开始最终销毁旧场景，就不再提供回滚：新层级、附加资源或初始化失败会使 Promise reject、销毁新场景半成品，并保留显示“加载失败，请重试”的 Loading；再次调用 `open()` 会复用该 Loading 进入重试或兜底场景。错误可从 `LX.snapshot().scenes.lastError` 诊断。

## UI 与摄像机

ui2 `GRoot` 是常驻 UI 根，不挂在业务 `Scene` 下。Loading 固定在 `UILayer.System` 且使用 `retention: "hide"`；大厅常驻入口、网络提示等也可采用 hide，场景 HUD、结算页等非持久窗口应声明 `retention: "destroy"`。框架不会仅凭窗口名称猜测归属，场景打开的专属 UI 应在 `onTransitionLeaving()` 显式关闭，或把关闭函数交给 `own()`。

2D 战斗摄像机放在战斗 `.ls` 的 `Area2D` 中并使用 `Camera2D`；战斗世界节点放在该 `Area2D` 下，HUD 仍由 `GRoot` 管理。这样摄像机只影响战斗世界，不影响 Loading、弹窗和系统 UI，也不需要额外建立 Unity 风格的 `UICamera`。

如需品牌化 Loading，可在 `createSceneLoadingPresenter(ui, content)` 返回自己的 `SceneLoadingPresenter`。它仍应使用 `UILayer.System`，并让 `show/update/fail/hide` 可承受连续请求和晚到完成。
