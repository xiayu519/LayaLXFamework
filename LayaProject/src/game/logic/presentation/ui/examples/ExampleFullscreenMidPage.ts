import type { UIViewSession } from "../../../../../framework/presentation/ui/UIViewRoute";
import type { ExampleFullscreenMidView } from "./ExampleFullscreenMidView";

export interface ExampleFullscreenMidArgs { readonly title: string; }

/** A fullscreen native Runtime with fixed centered content and no popup shell/animation. */
export function bindFullscreenMid(view: ExampleFullscreenMidView, args: ExampleFullscreenMidArgs,
    session: UIViewSession): void {
    let count = 0;
    const render = (): void => { view.counterText.text = `点击次数：${count}`; };
    const increment = (): void => { count++; render(); };
    const close = view.frame.getChild("closeButton");
    view.frame.title = args.title;
    render();
    view.actionButton.on(Laya.Event.CLICK, view, increment);
    close.on(Laya.Event.CLICK, view, session.close);
    session.lifetime.defer(() => {
        view.actionButton.off(Laya.Event.CLICK, view, increment);
        close.off(Laya.Event.CLICK, view, session.close);
    });
}
