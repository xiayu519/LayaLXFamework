import type { RedDotStore } from "./RedDotStore";
import { UIBindings } from "./UIBindings";

const { regClass, property } = Laya;

/** 挂到已有 UI 节点并在 IDE 中指定引用，不创建显示对象。 */
@regClass()
export class RedDotBinding extends Laya.Script {
    private static defaultValue: RedDotStore | undefined;

    public static get defaultStore(): RedDotStore | undefined {
        return this.defaultValue;
    }

    /** 启用 UI 前安装默认实例；替换或移除前，先销毁使用它的 UI 持有者。 */
    public static setDefaultStore(store: RedDotStore | undefined): void {
        this.defaultValue = store;
    }

    @property({ type: String, caption: "红点路径" })
    public key = "";
    @property({ type: Laya.Sprite, caption: "红点节点" })
    public badge: Laya.Sprite | null = null;
    @property({ type: Laya.GTextField, caption: "数量文本（可选）" })
    public countText: Laya.GTextField | null = null;
    @property({ type: Number, caption: "数量显示上限（0 为不限）", min: 0 })
    public maxCount = 99;
    private sourceOverride: RedDotStore | undefined;
    private bindings: UIBindings | undefined;
    private listening = false;

    /** 用于场景局部红点状态或复用的 GList 行；未指定时使用应用级实例。 */
    public bind(store: RedDotStore | undefined, key = this.key): void {
        // 先拒绝无效绑定，再解除此前仍有效的绑定。
        if (key) {
            (store ?? RedDotBinding.defaultStore)?.get(key);
        }
        this.sourceOverride = store;
        this.key = key;
        this.refreshBinding();
    }

    public override onEnable(): void {
        this.listening = true;
        this.refreshBinding();
    }

    public override onDisable(): void {
        this.listening = false;
        this.detach();
        this.clearBadge();
    }

    public override onDestroy(): void {
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
        if (this.badge && !this.badge.destroyed) {
            this.badge.visible = false;
        }
        if (this.countText && !this.countText.destroyed) {
            this.countText.text = "";
        }
    }
}
