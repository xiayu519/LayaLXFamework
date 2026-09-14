import type { ExampleItem, ExampleInventorySnapshot, InventoryApplyResult } from "../domain/ExampleInventory";

/** 任意功能或 UI 均可读取；模型不登记消费者。 */
export interface ExampleInventoryQuery {
    readonly items: readonly ExampleItem[];
    readonly version: number;
    readonly totalQuantity: number;
    snapshot(): ExampleInventorySnapshot;
}

export interface ExampleInventoryCommands {
    /** 联网实现将响应提交给账号持有的模型，不交给发起请求的 UI。 */
    use(id: string): boolean | Promise<boolean>;
}

/** 此能力提供给协议适配器；UI 只获得查询与业务命令。 */
export interface ExampleInventoryReceiver {
    applySnapshot(input: unknown): InventoryApplyResult;
    applyPatch(input: unknown): InventoryApplyResult;
}
