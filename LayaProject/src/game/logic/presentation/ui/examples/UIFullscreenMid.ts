import type { UIViewSession } from "../../../../../framework/presentation/ui/UIViewRoute";
import { UIFullscreenMidBase } from "./UIFullscreenMid.generated";

const { regClass } = Laya;

export interface UIFullscreenMidArgs { readonly title: string; }

/** Statically assigned prefab Runtime; presentation behavior stays beside its native node references. */
@regClass()
export class UIFullscreenMid extends UIFullscreenMidBase {
    /** Called for each presentation; return all asynchronous binding work for owner cleanup. */
    onBind(args: UIFullscreenMidArgs, session: UIViewSession): void {
        let count = 0;
        const render = (): void => { this.counterText.text = `点击次数：${count}`; };
        const increment = (): void => { count += 1; render(); };
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
