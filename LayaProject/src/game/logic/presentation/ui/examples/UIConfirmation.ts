import type { UIViewSession } from "../../../../../framework/presentation/ui/UIViewRoute";
import { UIConfirmationBase } from "./UIConfirmation.generated";

const { regClass } = Laya;

export interface UIConfirmationArgs {
    readonly title: string;
    readonly message: string;
    readonly confirmText: string;
    readonly onConfirm: () => void;
}

/** Statically assigned prefab Runtime; presentation behavior stays beside its native node references. */
@regClass()
export class UIConfirmation extends UIConfirmationBase {
    /** Called for each presentation; return all asynchronous binding work for owner cleanup. */
    onBind(args: UIConfirmationArgs, session: UIViewSession): void {
        let answered = false;
        const confirm = (): void => {
            if (answered || !session.token.isCurrent() || !this.mouseEnabled) return;
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
