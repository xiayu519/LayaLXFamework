import {
    PurchaseUnsupportedError,
    type PurchasePlatform,
    type PurchaseReceipt,
    type PurchaseRequest,
} from "./PurchasePlatform";

export class UnsupportedPurchasePlatform implements PurchasePlatform {
    readonly supported = false;

    async purchase(_request: PurchaseRequest): Promise<PurchaseReceipt> {
        throw new PurchaseUnsupportedError("purchase");
    }

    async restore(): Promise<readonly PurchaseReceipt[]> {
        throw new PurchaseUnsupportedError("restore");
    }
}
