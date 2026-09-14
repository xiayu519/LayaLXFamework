import type { UIViewSession } from "../../../../../framework/presentation/ui/UIViewRoute";
import { UIConfirmationBase } from "./UIConfirmation.generated";

const { regClass } = Laya;

export interface UIConfirmationArgs {
    readonly title: string;
    readonly message: string;
    readonly confirmText: string;
    readonly onConfirm: () => void;
}

/** 资源中静态指定的预制体 Runtime；展示逻辑与原生节点引用集中维护。 */
@regClass()
export class UIConfirmation extends UIConfirmationBase {
    /** 每次展示时调用；返回全部异步绑定工作，以便持有者清理。 */
    public onBind(args: UIConfirmationArgs, session: UIViewSession): void {
        let answered = false;
        const confirm = (): void => {
            if (answered || !session.token.isCurrent() || !this.mouseEnabled) {
                return;
            }
            answered = true;
            session.close();
            args.onConfirm();
        };
        this.frame.title = args.title;
        this.messageText.text = args.message;
        this.confirmButton.title = args.confirmText;
        const close = this.frame.getChild("closeButton");
        this.confirmButton.on(Laya.Event.CLICK, this, confirm);
        this.cancelButton.on(Laya.Event.CLICK, this, session.close);
        close.on(Laya.Event.CLICK, this, session.close);
        session.lifetime.defer(() => {
            this.confirmButton.off(Laya.Event.CLICK, this, confirm);
            this.cancelButton.off(Laya.Event.CLICK, this, session.close);
            close.off(Laya.Event.CLICK, this, session.close);
        });
    }
}
