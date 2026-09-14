/** 可选的服务器模拟状态，独立于背包数据和界面生命周期。 */
export interface ExampleDeliveryState {
    readonly feedback: string;
    readonly rewardPending: boolean;
}

export interface ExampleDeliveryControls {
    reset(): void;
    scheduleReward(): void;
    rebuildFromServer(): void;
    replayPreviousResponse(): void;
}
