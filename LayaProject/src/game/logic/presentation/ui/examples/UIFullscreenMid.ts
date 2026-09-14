import type { UIViewSession } from "../../../../../framework/presentation/ui/UIViewRoute";
import { UIFullscreenMidBase } from "./UIFullscreenMid.generated";

const { regClass } = Laya;

export interface UIFullscreenMidArgs { readonly title: string; }

/** 资源中静态指定的预制体 Runtime；展示逻辑与原生节点引用集中维护。 */
@regClass()
export class UIFullscreenMid extends UIFullscreenMidBase {
    /** 每次展示时调用；返回全部异步绑定工作，以便持有者清理。 */
    public onBind(args: UIFullscreenMidArgs, session: UIViewSession): void {
        let count = 0;
        const render = (): void => {
            this.counterText.text = `点击次数：${count}`;
        };
        const increment = (): void => {
            count += 1;
            render();
        };
        const close = this.frame.getChild("closeButton");
        this.frame.title = args.title;
        render();
        this.actionButton.on(Laya.Event.CLICK, this, increment);
        close.on(Laya.Event.CLICK, this, session.close);
        session.lifetime.defer(() => {
            this.actionButton.off(Laya.Event.CLICK, this, increment);
            close.off(Laya.Event.CLICK, this, session.close);
        });
    }
}
