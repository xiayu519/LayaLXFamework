export interface RenderSnapshot {
    readonly drawCalls2D: number;
    readonly drawCalls: number;
    readonly triangles: number;
    /** Resource-accounted CPU bytes, not the JavaScript heap or process memory. */
    readonly cpuBytes: number;
    /** Render-driver GPU allocation estimate in bytes; not physical device VRAM. */
    readonly gpuBytes: number;
    /** CT counters are window averages. False until the engine publishes its first window. */
    readonly statisticsReady?: boolean;
}

export interface RenderBudget {
    readonly drawCalls2D?: number;
    readonly drawCalls?: number;
    readonly triangles?: number;
    readonly cpuBytes?: number;
    readonly gpuBytes?: number;
}

export class RenderBudgetError extends Error {
    constructor(readonly violations: readonly string[]) {
        super(`Render budget exceeded: ${violations.join(", ")}.`);
        this.name = "RenderBudgetError";
    }
}

export class RenderPerformance {
    capture(): RenderSnapshot {
        const stats = Laya.LayaGL.statAgent;
        return Object.freeze({
            drawCalls2D: stats.getElementData(Laya.StatElement.CT_2DDrawCall),
            drawCalls: stats.getElementData(Laya.StatElement.CT_DrawCall),
            triangles: stats.getElementData(Laya.StatElement.CT_Triangle),
            cpuBytes: Laya.Resource.cpuMemory,
            gpuBytes: stats.getElementData(Laya.StatElement.M_GPUMemory) * 1024 * 1024,
            statisticsReady: stats.getElementData(Laya.StatElement.CT_FPS) > 0,
        });
    }

    assertBudget(budget: RenderBudget, snapshot = this.capture()): RenderSnapshot {
        if (snapshot.statisticsReady === false) {
            throw new Error("Laya statistics window is not ready; wait for a rendered sampling window.");
        }
        const violations: string[] = [];
        checkBudget(violations, "drawCalls2D", snapshot.drawCalls2D, budget.drawCalls2D);
        checkBudget(violations, "drawCalls", snapshot.drawCalls, budget.drawCalls);
        checkBudget(violations, "triangles", snapshot.triangles, budget.triangles);
        checkBudget(violations, "cpuBytes", snapshot.cpuBytes, budget.cpuBytes);
        checkBudget(violations, "gpuBytes", snapshot.gpuBytes, budget.gpuBytes);
        if (violations.length > 0) {
            throw new RenderBudgetError(violations);
        }
        return snapshot;
    }
}

function checkBudget(violations: string[], name: string, actual: number, maximum?: number): void {
    if (!Number.isFinite(actual) || actual < 0) {
        throw new Error(`Render measurement '${name}' must be a finite non-negative number.`);
    }
    if (maximum === undefined) {
        return;
    }
    if (!Number.isFinite(maximum) || maximum < 0) {
        throw new Error(`Render budget '${name}' must be a finite non-negative number.`);
    }
    if (actual > maximum) {
        violations.push(`${name}=${actual}>${maximum}`);
    }
}
