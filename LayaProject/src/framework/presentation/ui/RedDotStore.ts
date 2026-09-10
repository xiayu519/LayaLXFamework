/** Business-owned badge values. A parent adds its own value and all descendant values. */
export class RedDotStore extends Laya.EventDispatcher {
    private readonly values = new Map<string, number>();
    private readonly totals = new Map<string, number>();
    private readonly pending = new Map<string, number>();
    private notifying = false;
    private disposedValue = false;

    get disposed(): boolean { return this.disposedValue; }

    /** Read the aggregate immediately. Listen with the native on(key, caller, listener). */
    get(key: string): number {
        validateKey(key);
        return this.totals.get(key) ?? 0;
    }

    /** true contributes 1, false contributes 0. Replacing an unchanged value emits nothing. */
    set(key: string, value: number | boolean): void {
        this.setMany({ [key]: value });
    }

    /** Apply one business update atomically; each changed ancestor is notified once. */
    setMany(values: Readonly<Record<string, number | boolean>>): void {
        if (this.disposedValue) throw new Error("RedDotStore has been disposed.");
        const writes = new Map<string, number>();
        const deltas = new Map<string, number>();
        for (const key of Object.keys(values)) {
            validateKey(key);
            const value = normalizeValue(values[key]);
            const difference = value - (this.values.get(key) ?? 0);
            if (difference === 0) continue;
            writes.set(key, value);
            for (let ancestor = key; ancestor;) {
                const delta = (deltas.get(ancestor) ?? 0) + difference;
                if (!Number.isSafeInteger(delta)) throw new Error("Red dot aggregate exceeds the safe integer range.");
                deltas.set(ancestor, delta);
                const separator = ancestor.lastIndexOf("/");
                ancestor = separator < 0 ? "" : ancestor.slice(0, separator);
            }
        }
        // Validate the whole update before mutating either the direct values or aggregates.
        for (const [key, delta] of deltas) {
            const total = (this.totals.get(key) ?? 0) + delta;
            if (!Number.isSafeInteger(total) || total < 0) {
                throw new Error("Red dot aggregate exceeds the safe integer range.");
            }
        }
        for (const [key, value] of writes) writeValue(this.values, key, value);
        for (const [key, delta] of deltas) {
            if (delta === 0) continue;
            const previous = this.totals.get(key) ?? 0;
            writeValue(this.totals, key, previous + delta);
            if (!this.pending.has(key)) this.pending.set(key, previous);
        }
        this.flush();
    }

    /** Clear all values, including parent values; active bindings immediately become empty. */
    clear(): void {
        if (this.disposedValue) return;
        this.clearValues();
        this.flush();
    }

    /** Clear visible badges before dropping native listeners. Safe to call repeatedly. */
    dispose(): void {
        if (this.disposedValue) return;
        this.disposedValue = true;
        this.clearValues();
        this.flush();
    }

    private clearValues(): void {
        for (const [key, value] of this.totals) {
            if (!this.pending.has(key)) this.pending.set(key, value);
        }
        this.values.clear();
        this.totals.clear();
    }

    private flush(): void {
        if (this.notifying) return;
        this.notifying = true;
        try {
            while (this.pending.size > 0) {
                const [key, previous] = this.pending.entries().next().value!;
                this.pending.delete(key);
                const count = this.totals.get(key) ?? 0;
                // Reentrant business updates can cancel a queued change before it is delivered.
                if (count !== previous) this.event(key, count);
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
    // Native EventDispatcher stores events in a plain object; these root names collide with its prototype.
    const separator = key.indexOf("/");
    const root = separator < 0 ? key : key.slice(0, separator);
    if (root in Object.prototype) throw new Error("Red dot root key conflicts with a native event name.");
}

function normalizeValue(value: number | boolean): number {
    if (typeof value === "boolean") return value ? 1 : 0;
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error("Red dot values must be non-negative safe integers or booleans.");
    }
    return value;
}

function writeValue(values: Map<string, number>, key: string, value: number): void {
    if (value === 0) values.delete(key);
    else values.set(key, value);
}
