import type { DataKey } from "../../../framework/application/data/DataRegistry";
import type { ExampleInventoryQuery } from "./ExampleInventoryActions";

/** 导入数据键不会连带导入界面、服务或模型实现。 */
export const EXAMPLE_INVENTORY_DATA: DataKey<ExampleInventoryQuery> = { id: "examples.inventory" };
