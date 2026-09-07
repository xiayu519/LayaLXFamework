import type { ScenePhaseContext } from "./BaseGameScene";
import type {
    SceneTransitionPhase,
    SceneTransitionProgress,
} from "./SceneFlowTypes";

const PHASE_RANGE: Readonly<Record<SceneTransitionPhase, readonly [number, number]>> = {
    cleanup: [0, 0.1],
    scene: [0.1, 0.58],
    resources: [0.58, 0.8],
    prepare: [0.8, 0.9],
    switch: [0.9, 0.99],
    ready: [0.99, 1],
};

export class TransitionProgressReporter {
    private scene = 0;
    private resources = 0;
    private overall = 0;
    private value: SceneTransitionProgress;

    constructor(
        private readonly requestId: number,
        private readonly routeId: string,
        private readonly isActive: () => boolean,
        private readonly publish: (progress: SceneTransitionProgress) => void,
    ) {
        this.value = progressSnapshot(requestId, routeId, "cleanup", 0, 0, 0, 0);
    }

    get current(): SceneTransitionProgress {
        return this.value;
    }

    emit(phase: SceneTransitionPhase, rawProgress: number): void {
        if (!this.isActive()) return;
        const phaseProgress = clampProgress(rawProgress);
        if (phase === "scene") this.scene = Math.max(this.scene, phaseProgress);
        if (phase === "resources") this.resources = Math.max(this.resources, phaseProgress);
        const [start, end] = PHASE_RANGE[phase];
        this.overall = Math.max(this.overall, start + (end - start) * phaseProgress);
        this.value = progressSnapshot(
            this.requestId,
            this.routeId,
            phase,
            phaseProgress,
            this.scene,
            this.resources,
            this.overall,
        );
        this.publish(this.value);
    }
}

export function createPhaseContext<TArgs>(
    args: TArgs,
    signal: AbortSignal,
    reportProgress: (progress: number) => void,
): ScenePhaseContext<TArgs> {
    return Object.freeze({ args, signal, reportProgress });
}

function progressSnapshot(
    requestId: number,
    routeId: string,
    phase: SceneTransitionPhase,
    phaseProgress: number,
    scene: number,
    resources: number,
    overall: number,
): SceneTransitionProgress {
    return Object.freeze({ requestId, routeId, phase, phaseProgress, scene, resources, overall });
}

function clampProgress(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
}
