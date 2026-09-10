import type { UIViewSession } from "../../../../../framework/presentation/ui/UIViewRoute";
import type { ExampleSceneArgs } from "../../../application/ExampleWorlds";
import type { ExampleInventoryContext } from "./ExampleInventoryContext";
import { UIBattleBase } from "./UIBattle.generated";

const { regClass } = Laya;

/** Battle Scene owns this page; its shared inventory comes from the outer account module. */
@regClass()
export class UIBattle extends UIBattleBase {
    onBind(args: ExampleSceneArgs, session: UIViewSession, inventory: ExampleInventoryContext,
        returnLobby: () => Promise<void>): void {
        this.frame.title = args.detail;
        session.bindData(inventory.changes, inventory.changedEvent, () => {
            this.counterText.text = `战斗中的账号背包\n${inventory.state.items.length} 种 · 共 ${inventory.state.totalQuantity} 件\n\n大厅未打开，奖励仍可到账`;
        });
        const leave = (): void => { void returnLobby().catch(error => console.error("[World examples] return lobby failed", error)); };
        const close = this.frame.getChild("closeButton");
        this.actionButton.title = "返回大厅";
        this.actionButton.on(Laya.Event.CLICK, this, leave);
        close.on(Laya.Event.CLICK, this, leave);
        session.lifetime.defer(() => {
            this.actionButton.off(Laya.Event.CLICK, this, leave);
            close.off(Laya.Event.CLICK, this, leave);
        });
    }
}
