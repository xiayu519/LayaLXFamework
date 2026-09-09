const { regClass } = Laya;

@regClass()
export class ExampleConfirmationView extends Laya.GWidget {
    frame!: Laya.GLabel;
    messageText!: Laya.GTextField;
    confirmButton!: Laya.GButton;
    cancelButton!: Laya.GButton;
}
