import { LifetimeCleanupError } from "../../application/lifecycle/LifetimeScope";
import type { RedDotStore } from "./RedDotStore";

export interface RedDotOptions {
    readonly countText?: Laya.GTextField;
    /** Defaults to 99; zero displays the full count. */
    readonly maxCount?: number;
}

interface DataBinding {
    readonly source: Laya.EventDispatcher;
    readonly events: readonly string[];
    readonly notify: () => void;
    readonly refresh: () => void;
    active: boolean;
    pending: boolean;
}

/** Presentation-owned subscriptions. Models retain their own lifetime and expose native events. */
export class UIBindings {
    private readonly bindings = new Set<DataBinding>();
    private active = true;
    private disposed = false;

    constructor(private readonly view: Laya.Sprite, private readonly redDots?: RedDotStore) {}

    /** Render the current snapshot now, then coalesce native notifications until callLater runs. */
    bindData(source: Laya.EventDispatcher, event: string | readonly string[], render: () => void): () => void {
        this.requireAlive();
        const events = [...new Set(typeof event === "string" ? [event] : event)];
        if (!events.length || events.some(key => !key)) throw new Error("UI binding events must be non-empty.");
        const binding: DataBinding = {
            source, events, active: false, pending: false,
            notify: () => {
                if (!binding.active) return;
                binding.pending = true;
                Laya.timer.callLater(binding, binding.refresh);
            },
            refresh: () => {
                binding.pending = false;
                if (!binding.active) return;
                if (this.view.destroyed) { this.dispose(); return; }
                try { render(); }
                catch (error) {
                    this.remove(binding);
                    throw error;
                }
            },
        };
        this.bindings.add(binding);
        try { if (this.active) this.activate(binding); }
        catch (error) { this.remove(binding); throw error; }
        return () => this.remove(binding);
    }

    /** Multiple badges can independently observe the same path, including recycled GList rows. */
    bindRedDot(badge: Laya.Sprite, key: string, options: RedDotOptions = {}): () => void {
        this.requireAlive();
        const store = this.redDots;
        if (!store || store.disposed) throw new Error("UI red dot bindings require an active RedDotStore.");
        store.get(key); // Validate before adding native subscriptions.
        const requestedLimit = options.maxCount ?? 99;
        const limit = Number.isFinite(requestedLimit) ? Math.max(0, Math.floor(requestedLimit)) : 0;
        return this.bindData(store, key, () => {
            const count = store.get(key);
            if (!badge.destroyed) badge.visible = count > 0;
            if (options.countText && !options.countText.destroyed) {
                options.countText.text = count === 0 ? "" : limit > 0 && count > limit ? `${limit}+` : String(count);
            }
        });
    }

    /** Paused views hold no subscriptions or queued work; resume reads fresh snapshots immediately. */
    setActive(active: boolean): void {
        if (this.disposed || this.active === active) return;
        this.active = active;
        const errors: unknown[] = [];
        for (const binding of [...this.bindings]) {
            try {
                if (active) this.activate(binding);
                else this.suspend(binding);
            } catch (error) {
                errors.push(error);
                try { this.remove(binding); } catch (cleanupError) { errors.push(cleanupError); }
            }
        }
        if (errors.length) throw new LifetimeCleanupError(errors);
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.active = false;
        const errors: unknown[] = [];
        for (const binding of [...this.bindings].reverse()) {
            try { this.remove(binding); } catch (error) { errors.push(error); }
        }
        if (errors.length) throw new LifetimeCleanupError(errors);
    }

    private activate(binding: DataBinding): void {
        if (!this.active || !this.bindings.has(binding) || binding.active) return;
        binding.active = true;
        for (const event of binding.events) binding.source.on(event, binding, binding.notify);
        binding.refresh();
    }

    private suspend(binding: DataBinding): void {
        if (!binding.active) return;
        binding.active = false;
        const errors: unknown[] = [];
        if (binding.pending) {
            binding.pending = false;
            try { Laya.timer.clearCallLater(binding, binding.refresh); } catch (error) { errors.push(error); }
        }
        for (const event of binding.events) {
            try { binding.source.off(event, binding, binding.notify); } catch (error) { errors.push(error); }
        }
        if (errors.length) throw new LifetimeCleanupError(errors);
    }

    private remove(binding: DataBinding): void {
        if (this.bindings.delete(binding)) this.suspend(binding);
    }

    private requireAlive(): void {
        if (this.disposed || this.view.destroyed) throw new Error("The UI binding presentation has ended.");
    }
}
