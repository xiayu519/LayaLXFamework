import type { UIBindings } from "./UIBindings";
import { UILayer } from "./UILayer";
import type { UIWindowLayout } from "./UILayoutService";

const { regClass, property } = Laya;

export interface UIViewSettings {
    readonly layout: UIWindowLayout;
    readonly layer: UILayer;
    readonly navigation: "page" | "overlay";
    readonly modal: boolean;
    readonly closeOnMaskClick: boolean;
    readonly multiplicity: "singleton" | "multiple";
    readonly retention: "hide" | "destroy";
}

/** Declare once on scene UI prefab roots. SceneUI connects callbacks after native deserialization. */
@regClass()
export class UIViewLifecycle extends Laya.Script {
    @property({ type: String, enumSource: ["fullscreen", "center-popup"], caption: "窗口布局" })
    layout: UIWindowLayout = "fullscreen";

    @property({ type: UILayer, caption: "显示层级" })
    layer: UILayer = UILayer.Screen;

    @property({ type: String, enumSource: ["page", "overlay"], caption: "页面导航" })
    navigation: "page" | "overlay" = "page";

    @property({ type: Boolean, caption: "使用公共遮罩" })
    modal = false;

    @property({ type: Boolean, caption: "点击遮罩关闭" })
    closeOnMaskClick = true;

    @property({ type: String, enumSource: ["singleton", "multiple"], caption: "实例数量（按所属者隔离）" })
    multiplicity: "singleton" | "multiple" = "singleton";

    @property({ type: String, enumSource: ["destroy", "hide"], caption: "关闭后的处理" })
    retention: "hide" | "destroy" = "destroy";

    private bindings: (() => UIBindings | undefined) | undefined;
    private viewDestroyed: (() => void) | undefined;
    private failed: ((error: unknown) => void) | undefined;

    /** Read only after native deserialization; retain plain settings, never the prefab or its component. */
    settings(): UIViewSettings {
        if (!["fullscreen", "center-popup"].includes(this.layout)
            || !Number.isInteger(this.layer) || this.layer < UILayer.Background || this.layer > UILayer.System
            || !["page", "overlay"].includes(this.navigation)
            || !["singleton", "multiple"].includes(this.multiplicity)
            || !["hide", "destroy"].includes(this.retention)
            || typeof this.modal !== "boolean" || typeof this.closeOnMaskClick !== "boolean") {
            throw new Error("UIViewLifecycle contains invalid prefab window settings.");
        }
        if (this.multiplicity === "multiple" && this.retention === "hide") {
            throw new Error("UIViewLifecycle cannot combine multiplicity 'multiple' with retention 'hide'.");
        }
        return Object.freeze({ layout: this.layout, layer: this.layer, navigation: this.navigation,
            modal: this.modal, closeOnMaskClick: this.closeOnMaskClick, multiplicity: this.multiplicity,
            retention: this.retention });
    }

    observe(bindings: () => UIBindings | undefined, destroyed: () => void, failed: (error: unknown) => void): void {
        if (this.bindings) throw new Error("UIViewLifecycle already belongs to a scene UI record.");
        this.bindings = bindings;
        this.viewDestroyed = destroyed;
        this.failed = failed;
    }

    override onEnable(): void { this.safely(() => this.bindings?.()?.setActive(true)); }
    override onDisable(): void {
        this.safely(() => {
            if (this.owner.destroyed) this.viewDestroyed?.();
            else this.bindings?.()?.setActive(false);
        });
    }
    override onDestroy(): void {
        this.safely(() => this.viewDestroyed?.());
        this.bindings = undefined;
        this.viewDestroyed = undefined;
        this.failed = undefined;
    }

    private safely(action: () => void): void {
        // Native Node.destroy has marked its owner destroyed; throwing would strand the remaining children.
        try { action(); } catch (error) { this.failed?.(error); }
    }
}
