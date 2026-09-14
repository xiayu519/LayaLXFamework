/** 业务持有的红点数值；父节点汇总自身与所有后代的数值。 */
export class RedDotStore extends Laya.EventDispatcher {
    private readonly values = new Map<string, number>();
    private readonly totals = new Map<string, number>();
    private readonly pending = new Map<string, number>();
    private notifying = false;
    private disposedValue = false;

    public get disposed(): boolean {
        return this.disposedValue;
    }

    /** 立即读取汇总值；通过原生 on(key, caller, listener) 监听变化。 */
    public get(key: string): number {
        validateKey(key);
        return this.totals.get(key) ?? 0;
    }

    /** true 计为 1，false 计为 0；设置相同值不会触发通知。 */
    public set(key: string, value: number | boolean): void {
        this.setMany({ [key]: value });
    }

    /** 一次业务更新整体生效；每个发生变化的祖先节点只通知一次。 */
    public setMany(values: Readonly<Record<string, number | boolean>>): void {
        if (this.disposedValue) {
            throw new Error("RedDotStore has been disposed.");
        }
        const writes = new Map<string, number>();
        const deltas = new Map<string, number>();
        for (const key of Object.keys(values)) {
            validateKey(key);
            const value = normalizeValue(values[key]);
            const difference = value - (this.values.get(key) ?? 0);
            if (difference === 0) {
                continue;
            }
            writes.set(key, value);
            for (let ancestor = key; ancestor;) {
                const delta = (deltas.get(ancestor) ?? 0) + difference;
                if (!Number.isSafeInteger(delta)) {
                    throw new Error("Red dot aggregate exceeds the safe integer range.");
                }
                deltas.set(ancestor, delta);
                const separator = ancestor.lastIndexOf("/");
                ancestor = separator < 0 ? "" : ancestor.slice(0, separator);
            }
        }
        // 先校验整批更新，再修改直接值与汇总值。
        for (const [key, delta] of deltas) {
            const total = (this.totals.get(key) ?? 0) + delta;
            if (!Number.isSafeInteger(total) || total < 0) {
                throw new Error("Red dot aggregate exceeds the safe integer range.");
            }
        }
        for (const [key, value] of writes) {
            writeValue(this.values, key, value);
        }
        for (const [key, delta] of deltas) {
            if (delta === 0) {
                continue;
            }
            const previous = this.totals.get(key) ?? 0;
            writeValue(this.totals, key, previous + delta);
            if (!this.pending.has(key)) {
                this.pending.set(key, previous);
            }
        }
        this.flush();
    }

    /** 清空所有数值，包括父节点自身的值；活动绑定立即显示为空。 */
    public clear(): void {
        if (this.disposedValue) {
            return;
        }
        this.clearValues();
        this.flush();
    }

    /** 先清空可见红点，再移除原生监听；可重复调用。 */
    public dispose(): void {
        if (this.disposedValue) {
            return;
        }
        this.disposedValue = true;
        this.clearValues();
        this.flush();
    }

    private clearValues(): void {
        for (const [key, value] of this.totals) {
            if (!this.pending.has(key)) {
                this.pending.set(key, value);
            }
        }
        this.values.clear();
        this.totals.clear();
    }

    private flush(): void {
        if (this.notifying) {
            return;
        }
        this.notifying = true;
        try {
            while (this.pending.size > 0) {
                const [key, previous] = this.pending.entries().next().value!;
                this.pending.delete(key);
                const count = this.totals.get(key) ?? 0;
                // 业务更新重入时，可能抵消尚未派发的队列变化。
                if (count !== previous) {
                    this.event(key, count);
                }
            }
        } finally {
            this.notifying = false;
            if (this.disposedValue) {
                this.offAll();
                this.pending.clear();
            }
        }
    }
}

function validateKey(key: string): void {
    if (!key || key.trim() !== key || key.startsWith("/") || key.endsWith("/") || key.includes("//")) {
        throw new Error("Red dot keys must be non-empty slash-separated paths without empty segments.");
    }
    // 原生 EventDispatcher 用普通对象保存事件；这些根名称会与对象原型冲突。
    const separator = key.indexOf("/");
    const root = separator < 0 ? key : key.slice(0, separator);
    if (root in Object.prototype) {
        throw new Error("Red dot root key conflicts with a native event name.");
    }
}

function normalizeValue(value: number | boolean): number {
    if (typeof value === "boolean") {
        return value ? 1 : 0;
    }
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error("Red dot values must be non-negative safe integers or booleans.");
    }
    return value;
}

function writeValue(values: Map<string, number>, key: string, value: number): void {
    if (value === 0) {
        values.delete(key);
    } else {
        values.set(key, value);
    }
}
