export interface SimulationStep {
    readonly deltaMs: number;
    readonly elapsedMs: number;
}

export class SimulationClock {
    private elapsed = 0;
    private timeScaleValue = 1;
    private pausedValue = false;

    constructor(private readonly maxStepMs = 100) {
        if (!Number.isFinite(maxStepMs) || maxStepMs <= 0) {
            throw new Error("maxStepMs must be a positive finite number.");
        }
    }

    get elapsedMs(): number {
        return this.elapsed;
    }

    get timeScale(): number {
        return this.timeScaleValue;
    }

    set timeScale(value: number) {
        if (!Number.isFinite(value) || value < 0) {
            throw new Error("timeScale must be a non-negative finite number.");
        }
        this.timeScaleValue = value;
    }

    get paused(): boolean {
        return this.pausedValue;
    }

    set paused(value: boolean) {
        this.pausedValue = value;
    }

    tick(realDeltaMs: number): SimulationStep {
        if (!Number.isFinite(realDeltaMs) || realDeltaMs < 0) {
            throw new Error("realDeltaMs must be a non-negative finite number.");
        }
        const deltaMs = this.pausedValue
            ? 0
            : Math.min(realDeltaMs, this.maxStepMs) * this.timeScaleValue;
        this.elapsed += deltaMs;
        return { deltaMs, elapsedMs: this.elapsed };
    }

    reset(elapsedMs = 0): void {
        if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
            throw new Error("elapsedMs must be a non-negative finite number.");
        }
        this.elapsed = elapsedMs;
    }
}
