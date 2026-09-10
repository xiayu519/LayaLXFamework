/** Optional server simulator state, independent of inventory data and view lifetime. */
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
