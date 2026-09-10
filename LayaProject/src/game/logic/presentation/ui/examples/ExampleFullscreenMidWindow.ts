import { BaseGameWindow } from "../../../../../framework/presentation/ui/BaseGameWindow";
import type { BindingToken } from "../../../../../framework/application/ui/AsyncBindingGuard";

export interface ExampleFullscreenMidArgs { readonly title: string; }

/** Fullscreen presentation with fixed centered content; PanelChrome remains a visual component. */
export class ExampleFullscreenMidWindow extends BaseGameWindow<ExampleFullscreenMidArgs> {
    constructor(pane: Laya.GWidget) {
        super(pane);
        this.closeButton = this.requireChild("frame", Laya.GLabel).getChild("closeButton");
    }

    protected onBind(args: ExampleFullscreenMidArgs, token: BindingToken): void {
        const frame = this.requireChild("frame", Laya.GLabel);
        const counter = this.requireChild("counterText", Laya.GTextField);
        const action = this.requireChild("actionButton", Laya.GButton);
        let count = 0;
        const render = (): void => { counter.text = `点击次数：${count}`; };
        const increment = (): void => { token.commit(() => { count++; render(); }); };
        token.commit(() => { frame.title = args.title; render(); });
        action.on(Laya.Event.CLICK, this, increment);
        this.presentation.defer(() => action.off(Laya.Event.CLICK, this, increment));
    }
}
