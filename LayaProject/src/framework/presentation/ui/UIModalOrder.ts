/** Apply public child ordering before Laya's deferred zOrder sort can move the mask. */
export function syncModalOrder(root: Laya.GRoot): void {
    const mask = root.modalLayer;
    const ordered = (Array.from(root.children) as Laya.GWidget[])
        .filter((child) => child !== mask)
        .sort((left, right) => left.zOrder - right.zOrder);
    const topModal = [...ordered].reverse()
        .find((child) => child instanceof Laya.GWindow && child.modal);
    mask.zOrder = topModal?.zOrder ?? 0;
    for (let index = 0; index < ordered.length; index += 1) {
        if (root.getChildIndex(ordered[index]) !== index) root.setChildIndex(ordered[index], index);
    }
    if (!topModal) {
        mask.removeSelf();
    } else if (mask.parent === root) {
        root.setChildIndexBefore(mask, root.getChildIndex(topModal));
    } else {
        root.addChildAt(mask, root.getChildIndex(topModal));
    }
}
