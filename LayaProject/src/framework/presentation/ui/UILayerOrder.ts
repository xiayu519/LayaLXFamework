import { UILayer, UI_LAYER_CAPACITY } from "./UILayer";

export interface UILayerEntry {
    readonly view: Laya.Sprite;
    readonly layer: UILayer;
    readonly order: number;
}

/** 只压缩现存窗口的排序；不把请求序号直接作为原生 zOrder。 */
export function applyLayerOrder(entries: readonly UILayerEntry[]): void {
    const ordered = [...entries].sort((a, b) => a.layer - b.layer || a.order - b.order);
    const counts = new Map<UILayer, number>();
    for (const entry of ordered) {
        const count = (counts.get(entry.layer) ?? 0) + 1;
        if (count > UI_LAYER_CAPACITY) {
            throw new Error(`UI layer ${entry.layer} exceeds ${UI_LAYER_CAPACITY} visible windows.`);
        }
        counts.set(entry.layer, count);
    }
    counts.clear();
    for (const entry of ordered) {
        const offset = counts.get(entry.layer) ?? 0;
        counts.set(entry.layer, offset + 1);
        const zOrder = entry.layer * UI_LAYER_CAPACITY + offset;
        if (entry.view.zOrder !== zOrder) {
            entry.view.zOrder = zOrder;
        }
    }
}

/** 在延迟执行 zOrder 排序前，使原生输入与渲染遍历顺序保持一致。 */
export function syncDisplayOrder(root: Laya.Sprite, mask?: Laya.Sprite, modal?: Laya.Sprite): void {
    const ordered = (root.children as readonly Laya.Sprite[]).filter(child => child !== mask)
        .sort((a, b) => a.zOrder - b.zOrder);
    if (mask && modal) {
        mask.zOrder = modal.zOrder;
        ordered.splice(ordered.indexOf(modal), 0, mask);
    }
    for (let index = 0; index < ordered.length; index++) {
        if (root.children[index] !== ordered[index]) {
            root.setChildIndex(ordered[index], index);
        }
    }
}
