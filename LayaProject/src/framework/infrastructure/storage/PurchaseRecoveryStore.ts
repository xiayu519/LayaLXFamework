import { isPurchaseRequest, type PurchaseRecoveryRequest } from "../../domain/purchase/PurchaseTypes";
import type { PurchaseRecovery } from "../../domain/purchase/PurchaseContracts";
import { SaveStore, type StorageDriver } from "./SaveStore";

/** 每个游戏、账号独立保存待查询请求，复用现有版本及写入校验。 */
export class PurchaseRecoveryStore implements PurchaseRecovery {
    public constructor(private readonly driver: StorageDriver, private readonly key = "lx.purchase") {
        if (!key.trim()) {
            throw new Error("Purchase storage key is empty.");
        }
    }

    public load(accountId: string): readonly PurchaseRecoveryRequest[] {
        const result = this.store(accountId).load();
        if (result.recovery) {
            throw new Error(`Purchase recovery '${accountId}' is damaged (${result.recovery}); original data preserved.`);
        }
        return result.value;
    }

    public save(accountId: string, requests: readonly PurchaseRecoveryRequest[]): void {
        // 每次写入前检查原档，不能因先前加载成功就覆盖后来损坏的记录。
        this.load(accountId);
        this.store(accountId).save(requests);
    }

    private store(accountId: string): SaveStore<readonly PurchaseRecoveryRequest[]> {
        return new SaveStore(this.driver, {
            key: `${this.key}:${encodeURIComponent(accountId)}`,
            currentVersion: 1,
            createDefault: () => [],
            validate(value: unknown): value is readonly PurchaseRecoveryRequest[] {
                return Array.isArray(value) && value.every(item => isPurchaseRequest(item) && item.accountId === accountId
                    && typeof (item as PurchaseRecoveryRequest).launched === "boolean")
                    && new Set(value.map(item => (item as PurchaseRecoveryRequest).requestId)).size === value.length;
            },
        });
    }
}
