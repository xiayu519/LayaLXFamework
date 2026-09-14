import {
    PurchaseUnsupportedError,
    type PurchasePlatform,
    type PurchaseReceipt,
    type PurchaseRequest,
} from "./PurchasePlatform";

export class UnsupportedPurchasePlatform implements PurchasePlatform {
    public readonly supported = false;

    public async purchase(_request: PurchaseRequest): Promise<PurchaseReceipt> {
        throw new PurchaseUnsupportedError("purchase");
    }

    public async restore(): Promise<readonly PurchaseReceipt[]> {
        throw new PurchaseUnsupportedError("restore");
    }
}
