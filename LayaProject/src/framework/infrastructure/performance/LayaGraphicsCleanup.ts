import type { AppService } from "../../application/lifecycle/AppService";

interface GraphicsUnit {
    primitiveShaderData?: Pick<Laya.ShaderData, "setTexture">;
    element?: { owner: unknown; value2DShaderData: unknown; globalShaderData: unknown; materialShaderData: unknown };
}

interface GraphicsUnitPool { recover(unit: GraphicsUnit | null): void; }

interface WebGraphicsBackend { WebGraphicsRenderUnitPool?: GraphicsUnitPool; }

/**
 * 仅针对 v3.4.1 修复 WebGraphicsRenderUnitPool.recover 残留纹理和持有者引用的问题。
 * 引擎后端导出了此池，但 LayaAir.d.ts 未声明其内部类型；兼容处理集中在此处。
 * 引用计数通过原生 ShaderData 赋值方法维护；分配、容量限制和复用继续由引擎负责。
 * 不修改 SDK 文件，也不操作私有引用计数器。
 */
export class LayaGraphicsCleanup implements AppService {
    public readonly name = "laya-graphics-cleanup";
    private restore: (() => void) | undefined;

    public start(): void {
        if (this.restore || Laya.LayaEnv?.version !== "3.4.1") {
            return;
        }
        const pool = (Laya as unknown as WebGraphicsBackend).WebGraphicsRenderUnitPool;
        if (!pool) {
            return;
        } // 其他后端需分别审查源码并在对应设备验证。
        const original = pool.recover;
        const { UNIFORM_SPRITETEXTURE, UNIFORM_SPRITETEXTURE_ARRAY } = Laya.ShaderDefines2D;
        const recover: GraphicsUnitPool["recover"] = function(unit) {
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
        this.restore = () => {
            if (pool.recover === recover) {
                pool.recover = original;
            }
        };
    }

    public stop(): void {
        this.restore?.();
        this.restore = undefined;
    }
}
