import type { BootstrapOptions } from "./AppBootstrap";
import type { ContentEntry } from "../infrastructure/content/ContentCatalog";
import type { DataEntry } from "../application/data/DataRegistry";
import type { PlatformService } from "../platform/PlatformService";
import type { PurchasePlatform } from "../platform/purchase/PurchasePlatform";
import type { HttpTransport } from "../infrastructure/network/HttpTransport";
import type { UIRouter } from "../presentation/ui/UIRouter";
import type { SceneLoadingPresenter } from "../presentation/scene/SceneFlow";

/** 唯一框架实例 lx 的游戏配置，不创建第二套运行时。 */
export interface ApplicationConfig {
    readonly tipPrefabUrl: string;
    readonly content?: readonly ContentEntry[];
    readonly data?: readonly DataEntry[];
    readonly initialWorld?: string;
    readonly lifecycle?: BootstrapOptions & { readonly pendingLoadTimeoutMs?: number };
    readonly platform?: PlatformService;
    readonly purchase?: PurchasePlatform;
    readonly http?: HttpTransport;
    createSceneLoadingPresenter?(ui: UIRouter): SceneLoadingPresenter;
    /** 注册公共 UI、全局模型与规则以及 World 工厂；此处不加载 World。 */
    register?(): void;
    initialize?(signal: AbortSignal): void | Promise<void>;
    /** 接入服务器的游戏必须等待完整的首次数据快照，包括红点状态。 */
    readonly synchronization?: {
        readonly source: string;
        synchronize(signal: AbortSignal): Promise<void>;
    };
    /** register/initialize 部分失败后也会调用；必须可重复执行。 */
    dispose?(): void | Promise<void>;
}
