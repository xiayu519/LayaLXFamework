import type { DataKey } from "../../../framework/application/data/DataRegistry";
import type { ExampleInventoryQuery } from "./ExampleInventoryActions";

/** Importing a data key never imports a view, service or model implementation. */
export const EXAMPLE_INVENTORY_DATA: DataKey<ExampleInventoryQuery> = { id: "examples.inventory" };
