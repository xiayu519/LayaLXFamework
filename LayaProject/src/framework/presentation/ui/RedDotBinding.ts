import type { RedDotStore } from "./RedDotStore";
import { UIBindings } from "./UIBindings";

const { regClass, property } = Laya;

/** Attach to an existing UI node and assign references in the IDE; creates no display objects. */
@regClass()
export class RedDotBinding extends Laya.Script {
    private static defaultValue: RedDotStore | undefined;

    static get defaultStore(): RedDotStore | undefined { return this.defaultValue; }

    /** Install before enabling UI; dispose its UI owners before replacing/removing this default. */
    static setDefaultStore(store: RedDotStore | undefined): void {
        this.defaultValue = store;
    }

    @property({ type: String, caption: "红点路径" })
    key = "";

    @property({ type: Laya.Sprite, caption: "红点节点" })
    badge: Laya.Sprite | null = null;

    @property({ type: Laya.GTextField, caption: "数量文本（可选）" })
    countText: Laya.GTextField | null = null;

    @property({ type: Number, caption: "数量显示上限（0 为不限）", min: 0 })
    maxCount = 99;

    private sourceOverride: RedDotStore | undefined;
    private bindings: UIBindings | undefined;
    private listening = false;

    /** For scene-local stores or recycled GList rows. Undefined uses the application store. */
    bind(store: RedDotStore | undefined, key = this.key): void {
        // Reject an invalid binding before detaching the previous working one.
        if (key) (store ?? RedDotBinding.defaultStore)?.get(key);
        this.sourceOverride = store;
        this.key = key;
        this.refreshBinding();
    }

    override onEnable(): void {
        this.listening = true;
        this.refreshBinding();
    }

    override onDisable(): void {
        this.listening = false;
        this.detach();
        this.clearBadge();
    }

    override onDestroy(): void {
        this.onDisable();
        this.sourceOverride = undefined;
        this.badge = null;
        this.countText = null;
    }

    private refreshBinding(): void {
        this.detach();
        const store = this.sourceOverride ?? RedDotBinding.defaultStore;
        if (!this.listening || !store || !this.key || store.disposed || !this.badge || this.badge.destroyed) {
            this.clearBadge();
            return;
        }
        const view = this.owner instanceof Laya.Sprite ? this.owner : this.badge;
        const bindings = new UIBindings(view, store);
        this.bindings = bindings;
        try {
            bindings.bindRedDot(this.badge, this.key, { countText: this.countText ?? undefined, maxCount: this.maxCount });
        } catch (error) {
            this.detach();
            throw error;
        }
    }

    private detach(): void {
        const bindings = this.bindings;
        this.bindings = undefined;
        bindings?.dispose();
    }

    private clearBadge(): void {
        if (this.badge && !this.badge.destroyed) this.badge.visible = false;
        if (this.countText && !this.countText.destroyed) this.countText.text = "";
    }
}
