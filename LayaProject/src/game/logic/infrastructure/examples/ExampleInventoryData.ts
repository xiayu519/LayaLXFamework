import type { ExampleInventoryQuery, ExampleInventoryReceiver } from "../../application/ExampleInventoryActions";
import type { ExampleInventory, InventoryApplyResult } from "../../domain/ExampleInventory";

export const EXAMPLE_INVENTORY_RED_DOT = "examples/inventory";

/** 账号数据在登录前即存在，独立于服务、World 和消费者。 */
export class ExampleInventoryData extends Laya.EventDispatcher implements ExampleInventoryQuery {
    public static readonly CHANGED = "example-inventory:changed";
    private generation = 0;

    public constructor(private readonly model: ExampleInventory) {
        super();
    }

    public get items() {
        return this.model.items;
    }

    public get version(): number {
        return this.model.version;
    }

    public get totalQuantity(): number {
        return this.model.totalQuantity;
    }

    public snapshot() {
        return this.model.snapshot();
    }

    /** 由连接持有此能力；旧账号之后才到达的数据包将失效。 */
    public createReceiver(): ExampleInventoryReceiver {
        const generation = this.generation;
        const apply = (action: () => InventoryApplyResult): InventoryApplyResult => {
            if (generation !== this.generation) {
                return "invalid";
            }
            const result = action();
            if (result === "applied") {
                this.event(ExampleInventoryData.CHANGED);
            }
            return result;
        };
        return {
            applySnapshot: input => apply(() => this.model.applySnapshot(input)),
            applyPatch: input => apply(() => this.model.applyPatch(input)),
        };
    }

    public clear(): void {
        ++this.generation;
        this.model.clear();
        this.event(ExampleInventoryData.CHANGED);
    }

    public dispose(): void {
        this.clear();
        this.offAll();
    }
}
