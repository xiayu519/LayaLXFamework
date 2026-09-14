import { syncDisplayOrder } from "./UILayerOrder";

/** 应用窗口始终直接挂在原生 GRoot 下。 */
export function syncModalOrder(root: Laya.GRoot): void {
    const mask = root.modalLayer;
    const ordered = (Array.from(root.children) as Laya.GWidget[])
        .filter((child) => child !== mask)
        .sort((left, right) => left.zOrder - right.zOrder);
    const topModal = [...ordered].reverse()
        .find((child) => child instanceof Laya.GWindow && child.modal);
    if (!topModal) {
        mask.removeSelf();
        mask.zOrder = 0;
    } else if (mask.parent !== root) {
        root.addChild(mask);
    }
    syncDisplayOrder(root, topModal ? mask : undefined, topModal);
}
