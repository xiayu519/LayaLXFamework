export interface PurchaseRequest {
    readonly productId: string;
    readonly payload?: Readonly<Record<string, string>>;
}

export interface PurchaseReceipt {
    readonly productId: string;
    readonly transactionId: string;
    readonly rawReceipt: string;
}

export interface PurchasePlatform {
    readonly supported: boolean;
    purchase(request: PurchaseRequest): Promise<PurchaseReceipt>;
    restore(): Promise<readonly PurchaseReceipt[]>;
}

export class PurchaseUnsupportedError extends Error {
    constructor(readonly operation: "purchase" | "restore") {
        super(`Purchase operation '${operation}' is not supported on this platform.`);
        this.name = "PurchaseUnsupportedError";
    }
}
