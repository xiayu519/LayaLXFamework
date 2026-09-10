import type { UIViewSession } from "../../../../../framework/presentation/ui/UIViewRoute";
import type { ExampleConfirmationView } from "./ExampleConfirmationView";

export interface ExampleConfirmationArgs {
    readonly title: string;
    readonly message: string;
    readonly confirmText: string;
    readonly onConfirm: () => void;
}

export function bindConfirmation(view: ExampleConfirmationView, args: ExampleConfirmationArgs,
    session: UIViewSession): void {
    let answered = false;
    const confirm = (): void => {
        if (answered || !session.token.isCurrent() || !view.mouseEnabled) return;
        answered = true;
        session.close();
        args.onConfirm();
    };
    view.frame.title = args.title;
    view.messageText.text = args.message;
    view.confirmButton.title = args.confirmText;
    const close = view.frame.getChild("closeButton");
    view.confirmButton.on(Laya.Event.CLICK, view, confirm);
    view.cancelButton.on(Laya.Event.CLICK, view, session.close);
    close.on(Laya.Event.CLICK, view, session.close);
    session.lifetime.defer(() => {
        view.confirmButton.off(Laya.Event.CLICK, view, confirm);
        view.cancelButton.off(Laya.Event.CLICK, view, session.close);
        close.off(Laya.Event.CLICK, view, session.close);
    });
}
