import { lx, type ApplicationConfig } from "../../../framework/lx";
import type { BootstrapProgress } from "../../../framework/application/lifecycle/AppService";
import type { SceneTransitionProgress } from "../../../framework/presentation/scene/SceneFlow";
import type { UIRouter } from "../../../framework/presentation/ui/UIRouter";
import { ExampleInventory } from "../domain/ExampleInventory";
import { EXAMPLE_INVENTORY_DATA } from "../application/ExampleDataKeys";
import { ExampleInventoryData, EXAMPLE_INVENTORY_RED_DOT } from "../infrastructure/examples/ExampleInventoryData";
import { ExampleDeliveryService } from "../infrastructure/examples/ExampleDeliveryService";
import { GameTablesService } from "../infrastructure/tables/GameTablesService";
import { DefaultSceneLoadingPresenter } from "../presentation/ui/DefaultSceneLoadingPresenter";
import { InventoryRedDotService } from "./InventoryRedDotService";
import { registerCommonUI } from "./registerCommonUI";
import { LOBBY_WORLD, BATTLE_WORLD } from "../application/ExampleWorlds";
import { LobbyWorld } from "./worlds/LobbyWorld";
import { BattleWorld } from "./worlds/BattleWorld";

export interface ApplicationStartupProgress {
    onServiceProgress(progress: BootstrapProgress): void;
    onSceneProgress(progress: SceneTransitionProgress): void;
}

/** 可调用示例库的游戏配置；框架模块只在 lx.ts 初始化。 */
export class GameApplication implements ApplicationConfig {
    public readonly tipPrefabUrl = "bootstrap/ui/UITip.lh";
    public readonly initialWorld = LOBBY_WORLD;
    public readonly content = [{ id: "lx.runtime-config", url: "bootstrap/config/runtime.json", kind: "data" as const }];
    private readonly account = new ExampleInventoryData(new ExampleInventory());
    // 模拟器单独持有服务端状态，不代表正式账号系统实现。
    private readonly delivery = new ExampleDeliveryService(new ExampleInventory(), this.account.createReceiver());
    public readonly data = [{ key: EXAMPLE_INVENTORY_DATA, value: this.account }];
    public lifecycle: ApplicationConfig["lifecycle"];
    private tables?: GameTablesService;
    private redDotRules?: InventoryRedDotService;
    private navigation?: Promise<void>;
    private stopped = false;

    public readonly synchronization = {
        source: "development-simulator",
        synchronize: async (signal: AbortSignal): Promise<void> => {
            // TODO（服务端）：将此演示适配器替换为登录与完整的首次数据同步，
            // 包括账号、IAP 权益和红点状态；Socket OPEN 不代表数据就绪。
            await this.delivery.synchronize(signal);
            signal.throwIfAborted();
            this.redDotRules!.synchronize();
        },
    };

    public constructor(private startup?: ApplicationStartupProgress) {
        this.lifecycle = { onProgress: startup?.onServiceProgress };
    }

    public createSceneLoadingPresenter(ui: UIRouter): DefaultSceneLoadingPresenter {
        return new DefaultSceneLoadingPresenter(ui, "bootstrap/ui/UISceneLoading.lh");
    }

    /** 所有示例 World 工厂集中在此注册，此时不创建或加载 World。 */
    public register(): void {
        // 此处只登记工厂；各 World 专属事件、UI 和 Scene 在各自子类中注册。
        // AppBootstrap 已复制进度回调；首次注册完成后，
        // 不再通过长期持有的游戏配置保留启动 Loading 场景。
        this.lifecycle = undefined;
        const inventory = { state: this.account, commands: this.delivery, changes: this.account,
            changedEvent: ExampleInventoryData.CHANGED, redDotKey: EXAMPLE_INVENTORY_RED_DOT };
        const delivery = { state: this.delivery, controls: this.delivery, changes: this.delivery,
            changedEvent: ExampleDeliveryService.CHANGED };
        const inventoryRoute = registerCommonUI(lx.ui, inventory, delivery);
        let initialLobby = this.startup && { showLoading: false, onProgress: this.startup.onSceneProgress };
        this.startup = undefined;
        lx.worlds.register({ id: LOBBY_WORLD, create: () => {
            const options = initialLobby;
            initialLobby = undefined;
            return new LobbyWorld(inventory, delivery, inventoryRoute,
                () => this.switchWorld(LOBBY_WORLD, BATTLE_WORLD), options);
        } });
        lx.worlds.register({ id: BATTLE_WORLD,
            create: () => new BattleWorld(inventory, () => this.switchWorld(BATTLE_WORLD, LOBBY_WORLD)) });
    }

    /** 按依赖顺序初始化游戏内容，不再增加 Service/Context 组装层。 */
    public async initialize(signal: AbortSignal): Promise<void> {
        this.tables = new GameTablesService(lx.tables);
        await this.tables.start();
        signal.throwIfAborted();
        this.redDotRules = new InventoryRedDotService(this.account, lx.redDots);
        this.redDotRules.start();
        this.delivery.start();
        await lx.config.load("lx.runtime-config");
        signal.throwIfAborted();
        lx.logger.log("[LX] CONFIG READY");
    }

    public async dispose(): Promise<void> {
        this.stopped = true;
        await this.navigation?.catch(() => {});
        this.delivery.stop();
        this.redDotRules?.stop();
        this.account.dispose();
        this.tables?.stop();
        lx.config.release("lx.runtime-config");
    }

    private switchWorld(from: string, to: string): Promise<void> {
        if (this.stopped) return Promise.resolve();
        if (this.navigation) return this.navigation;
        const worlds = lx.worlds;
        const task = (async () => {
            await worlds.exit(from);
            if (!this.stopped) await worlds.enter(to);
        })();
        this.navigation = task;
        const complete = (): void => { if (this.navigation === task) this.navigation = undefined; };
        void task.then(complete, complete);
        return task;
    }
}
