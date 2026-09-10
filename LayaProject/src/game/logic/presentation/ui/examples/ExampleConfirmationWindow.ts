import { BaseGameWindow } from "../../../../../framework/presentation/ui/BaseGameWindow";
import type { BindingToken } from "../../../../../framework/application/ui/AsyncBindingGuard";
import { ExampleConfirmationView } from "./ExampleConfirmationView";

export interface ExampleConfirmationArgs {
    readonly title: string;
    readonly message: string;
    readonly confirmText: string;
    readonly onConfirm: () => void;
}

export class ExampleConfirmationWindow extends BaseGameWindow<ExampleConfirmationArgs> {
    private readonly view: ExampleConfirmationView;

    constructor(pane: Laya.GWidget) {
        super(pane);
        if (!(pane instanceof ExampleConfirmationView)) {
            throw new Error("Confirmation.lh must use ExampleConfirmationView.");
        }
        this.view = pane;
        this.closeButton = pane.frame.getChild("closeButton");
    }

    protected onBind(args: ExampleConfirmationArgs, token: BindingToken): void {
        const view = this.view;
        let answered = false;
        const confirm = (): void => {
            if (answered || !token.isCurrent() || !this.mouseEnabled) return;
            answered = true;
            this.hide();
            args.onConfirm();
        };
        const cancel = (): void => { this.hide(); };
        token.commit(() => {
            view.frame.title = args.title;
            view.messageText.text = args.message;
            view.confirmButton.title = args.confirmText;
            view.confirmButton.on(Laya.Event.CLICK, this, confirm);
            view.cancelButton.on(Laya.Event.CLICK, this, cancel);
        });
        this.presentation.defer(() => {
            view.confirmButton.off(Laya.Event.CLICK, this, confirm);
            view.cancelButton.off(Laya.Event.CLICK, this, cancel);
        });
    }
}
