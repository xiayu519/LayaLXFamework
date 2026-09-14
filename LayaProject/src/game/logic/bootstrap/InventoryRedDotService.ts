import type { AppService } from "../../../framework/application/lifecycle/AppService";
import type { RedDotStore } from "../../../framework/presentation/ui/RedDotStore";
import { ExampleInventoryData, EXAMPLE_INVENTORY_RED_DOT } from "../infrastructure/examples/ExampleInventoryData";

/** 账号级红点规则持续有效，不随当前 World 或 UI 关闭。 */
export class InventoryRedDotService implements AppService {
    public readonly name = "inventory-red-dots";

    public constructor(
        private readonly inventory: ExampleInventoryData,
        private readonly redDots: RedDotStore,
    ) {
    }

    public start(): void {
        this.inventory.on(ExampleInventoryData.CHANGED, this, this.refresh);
        this.refresh();
    }

    public stop(): void {
        this.inventory.off(ExampleInventoryData.CHANGED, this, this.refresh);
    }

    /** 启动时直接调用并等待完成；原生事件回调不会将失败传回事件发送方。 */
    public synchronize(): void {
        this.refresh();
    }

    private refresh(): void {
        this.redDots.set(EXAMPLE_INVENTORY_RED_DOT, this.inventory.totalQuantity);
    }
}
