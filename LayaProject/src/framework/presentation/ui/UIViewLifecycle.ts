import type { UIBindings } from "./UIBindings";
import { UILayer } from "./UILayer";
import type { UIWindowLayout } from "./UILayoutService";

const { regClass, property } = Laya;

export interface UIViewSettings {
    readonly layout: UIWindowLayout;
    readonly layer: UILayer;
    readonly openMode: "replace" | "stack";
    readonly modal: boolean;
    readonly closeOnMaskClick: boolean;
    readonly multiplicity: "singleton" | "multiple";
    readonly retention: "hide" | "destroy";
}

/** 在场景 UI 预制体根节点声明一次；SceneUI 在原生反序列化后接入回调。 */
@regClass()
export class UIViewLifecycle extends Laya.Script {
    @property({
        type: String, enumSource: [
            { name: "全屏", value: "fullscreen" }, { name: "居中弹窗", value: "center-popup" },
        ], caption: "窗口布局"
    })
    public layout: UIWindowLayout = "fullscreen";
    @property({
        type: Number, enumSource: [
            { name: "背景层（0–999）", value: UILayer.Background }, { name: "页面层（1000–1999）", value: UILayer.Screen },
            { name: "常驻信息层（2000–2999）", value: UILayer.HUD }, { name: "弹窗层（3000–3999）", value: UILayer.Popup },
            { name: "引导层（4000–4999）", value: UILayer.Guide }, { name: "提示层（5000–5999）", value: UILayer.Toast },
            { name: "系统层（6000–6999）", value: UILayer.System },
        ], caption: "显示层级"
    })
    public layer: UILayer = UILayer.Screen;
    @property({
        type: String, enumSource: [
            { name: "关闭下层", value: "replace" }, { name: "叠加下层", value: "stack" },
        ], caption: "打开方式", hidden: "data.layout !== 'fullscreen'",
        tips: "仅影响当前场景内较早打开、层级在下方的全屏界面。新界面准备成功后才关闭；失败保留原界面。叠加时下层继续运行。弹窗不参与页面替换。"
    })
    public openMode: "replace" | "stack" = "replace";
    @property({ type: Boolean, caption: "使用公共遮罩" })
    public modal = false;
    @property({ type: Boolean, caption: "点击遮罩关闭" })
    public closeOnMaskClick = true;
    @property({
        type: String, enumSource: [
            { name: "单实例", value: "singleton" }, { name: "多实例", value: "multiple" },
        ], caption: "实例数量（按所属者隔离）", tips: "单实例只在同一场景或同一父窗口展示内复用；不同所属者各有自己的实例。多实例关闭时必须销毁。"
    })
    public multiplicity: "singleton" | "multiple" = "singleton";
    @property({
        type: String, enumSource: [
            { name: "销毁", value: "destroy" }, { name: "隐藏并缓存", value: "hide" },
        ], caption: "关闭后的处理", tips: "隐藏缓存只保留到所属场景或父窗口退出；退出时仍统一销毁。"
    })
    public retention: "hide" | "destroy" = "destroy";
    private bindings: (() => UIBindings | undefined) | undefined;
    private viewDestroyed: (() => void) | undefined;
    private failed: ((error: unknown) => void) | undefined;

    /** 只在原生反序列化后读取；仅保留普通配置，不持有预制体或组件。 */
    public settings(): UIViewSettings {
        if (!["fullscreen", "center-popup"].includes(this.layout)
            || !Number.isInteger(this.layer) || this.layer < UILayer.Background || this.layer > UILayer.System
            || !["replace", "stack"].includes(this.openMode)
            || !["singleton", "multiple"].includes(this.multiplicity)
            || !["hide", "destroy"].includes(this.retention)
            || typeof this.modal !== "boolean" || typeof this.closeOnMaskClick !== "boolean") {
            throw new Error("UIViewLifecycle contains invalid prefab window settings.");
        }
        if (this.multiplicity === "multiple" && this.retention === "hide") {
            throw new Error("UIViewLifecycle cannot combine multiplicity 'multiple' with retention 'hide'.");
        }
        return Object.freeze({
            layout: this.layout, layer: this.layer, openMode: this.layout === "center-popup" ? "stack" : this.openMode,
            modal: this.modal, closeOnMaskClick: this.closeOnMaskClick, multiplicity: this.multiplicity,
            retention: this.retention
        });
    }

    public observe(bindings: () => UIBindings | undefined, destroyed: () => void, failed: (error: unknown) => void): void {
        if (this.bindings) {
            throw new Error("UIViewLifecycle already belongs to a scene UI record.");
        }
        this.bindings = bindings;
        this.viewDestroyed = destroyed;
        this.failed = failed;
    }

    public override onEnable(): void {
        this.safely(() => this.bindings?.()?.setActive(true));
    }

    public override onDisable(): void {
        this.safely(() => {
            if (this.owner.destroyed) {
                this.viewDestroyed?.();
            } else {
                this.bindings?.()?.setActive(false);
            }
        });
    }

    public override onDestroy(): void {
        this.safely(() => this.viewDestroyed?.());
        this.bindings = undefined;
        this.viewDestroyed = undefined;
        this.failed = undefined;
    }

    private safely(action: () => void): void {
        // 原生 Node.destroy 已将持有者标记为销毁；此时抛错会遗留其余子节点。
        try {
            action();
        } catch (error) {
            this.failed?.(error);
        }
    }
}
