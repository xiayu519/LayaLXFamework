import type { BindingToken } from "../../../../framework/application/ui/AsyncBindingGuard";
import { BaseGameWindow } from "../../../../framework/presentation/ui/BaseGameWindow";
import { LX } from "../../../../framework/LX";
import type { UIRoute } from "../../../../framework/presentation/ui/UIRouter";
import type { ExampleInventoryArgs } from "./examples/ExampleInventoryWindow";

export interface FrameworkStatusArgs {
    readonly status: string;
    readonly detail: string;
}

export class FrameworkStatusWindow extends BaseGameWindow<FrameworkStatusArgs> {
    constructor(contentPane: Laya.GWidget, private readonly examplesRoute?: UIRoute<ExampleInventoryArgs>) {
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
        if (!this.examplesRoute) return;
        const route = this.examplesRoute;
        const button = this.requireChild("examplesButton", Laya.GButton);
        let opening = false;
        const open = async (): Promise<void> => {
            if (opening || !token.isCurrent()) return;
            opening = true;
            try {
                await LX.UI.show(route, { title: "旅行背包" }, { signal: token.signal });
            } catch (error) {
                if (token.isCurrent()) {
                    console.error("[UI examples] inventory failed", error);
                    LX.UI.tip("暂时无法打开，请重试");
                }
            } finally { opening = false; }
        };
        const click = (): void => { void open(); };
        button.on(Laya.Event.CLICK, this, click);
        this.presentation.defer(() => button.off(Laya.Event.CLICK, this, click));
    }
}
