import { afterEach, describe, expect, it, vi } from "vitest";
import { RenderPerformance } from "../../src/framework/infrastructure/performance/RenderPerformance";

afterEach(() => vi.unstubAllGlobals());

describe("RenderPerformance", () => {
    it("captures Laya counters and fails explicit budgets", () => {
        vi.stubGlobal("Laya", {
            LayaGL: { statAgent: { getElementData: (key: number) => key } },
            StatElement: { CT_2DDrawCall: 2, CT_DrawCall: 3, CT_Triangle: 4,
                CT_FPS: 60, M_GPUMemory: 7 },
            Resource: { cpuMemory: 5, gpuMemory: 6 },
        });
        const performance = new RenderPerformance();
        const snapshot = performance.capture();

        expect(snapshot).toEqual({ drawCalls2D: 2, drawCalls: 3, triangles: 4,
            cpuBytes: 5, gpuBytes: 7 * 1024 * 1024, statisticsReady: true });
        expect(() => performance.assertBudget({ drawCalls2D: 1 }, snapshot)).toThrow("drawCalls2D=2>1");
        expect(performance.assertBudget({ drawCalls2D: 2 }, snapshot)).toBe(snapshot);
    });

    it("rejects an uninitialized statistics window and invalid measurements", () => {
        const performance = new RenderPerformance();
        const snapshot = { drawCalls2D: 0, drawCalls: 0, triangles: 0, cpuBytes: 0, gpuBytes: 0 };
        expect(() => performance.assertBudget({}, { ...snapshot, statisticsReady: false }))
            .toThrow("statistics window");
        expect(() => performance.assertBudget({ gpuBytes: 100 }, { ...snapshot, gpuBytes: NaN }))
            .toThrow("gpuBytes");
        expect(() => performance.assertBudget({}, { ...snapshot, triangles: -1 })).toThrow("triangles");
    });
});
