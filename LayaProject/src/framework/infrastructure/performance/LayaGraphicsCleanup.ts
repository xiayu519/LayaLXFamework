import type { AppService } from "../../application/lifecycle/AppService";

interface GraphicsUnit {
    primitiveShaderData?: Pick<Laya.ShaderData, "setTexture">;
    element?: { owner: unknown; value2DShaderData: unknown; globalShaderData: unknown; materialShaderData: unknown };
}
interface GraphicsUnitPool { recover(unit: GraphicsUnit | null): void; }
interface WebGraphicsBackend { WebGraphicsRenderUnitPool?: GraphicsUnitPool; }

/**
 * Version-scoped repair for v3.4.1 WebGraphicsRenderUnitPool.recover retaining textures and owners.
 * The backend exports this pool but omits its internal types from LayaAir.d.ts. Keep the narrow
 * compatibility boundary here: native ShaderData setters balance references; allocation, limits
 * and reuse remain native. No SDK files or private reference counters are modified.
 */
export class LayaGraphicsCleanup implements AppService {
    readonly name = "laya-graphics-cleanup";
    private restore: (() => void) | undefined;

    start(): void {
        if (this.restore || Laya.LayaEnv?.version !== "3.4.1") return;
        const pool = (Laya as unknown as WebGraphicsBackend).WebGraphicsRenderUnitPool;
        if (!pool) return; // Different backends require their own source review and device verification.
        const original = pool.recover;
        const { UNIFORM_SPRITETEXTURE, UNIFORM_SPRITETEXTURE_ARRAY } = Laya.ShaderDefines2D;
        const recover: GraphicsUnitPool["recover"] = function (unit) {
            if (unit) {
                unit.primitiveShaderData?.setTexture(UNIFORM_SPRITETEXTURE, null!);
                unit.primitiveShaderData?.setTexture(UNIFORM_SPRITETEXTURE_ARRAY, null!);
                if (unit.element) {
                    unit.element.owner = null;
                    unit.element.value2DShaderData = null;
                    unit.element.globalShaderData = null;
                    unit.element.materialShaderData = null;
                }
            }
            original.call(pool, unit);
        };
        pool.recover = recover;
        this.restore = () => { if (pool.recover === recover) pool.recover = original; };
    }

    stop(): void { this.restore?.(); this.restore = undefined; }
}
