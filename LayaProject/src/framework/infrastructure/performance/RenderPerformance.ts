export interface RenderSnapshot {
    readonly drawCalls2D: number;
    readonly drawCalls: number;
    readonly triangles: number;
    readonly cpuBytes: number;
    readonly gpuBytes: number;
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
            gpuBytes: Laya.Resource.gpuMemory,
        });
    }

    assertBudget(budget: RenderBudget, snapshot = this.capture()): RenderSnapshot {
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
