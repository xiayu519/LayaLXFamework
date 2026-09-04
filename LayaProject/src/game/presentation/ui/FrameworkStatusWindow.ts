import type { BindingToken } from "../../../framework/application/ui/AsyncBindingGuard";
import { BaseGameWindow } from "../../../framework/presentation/ui/BaseGameWindow";

export interface FrameworkStatusArgs {
    readonly status: string;
    readonly detail: string;
}

export class FrameworkStatusWindow extends BaseGameWindow<FrameworkStatusArgs> {
    constructor(contentPane: Laya.GWidget) {
        super(contentPane);
        this.modal = false;
    }

    protected onBind(args: FrameworkStatusArgs, token: BindingToken): void {
        const statusText = this.requireChild("statusText", Laya.GTextField);
        const detailText = this.requireChild("detailText", Laya.GTextField);
        token.commit(() => {
            statusText.text = args.status;
            detailText.text = args.detail;
        });
    }
}
