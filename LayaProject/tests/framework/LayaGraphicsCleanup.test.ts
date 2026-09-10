import { afterEach, describe, expect, it, vi } from "vitest";
import { LayaGraphicsCleanup } from "../../src/framework/infrastructure/performance/LayaGraphicsCleanup";

afterEach(() => vi.unstubAllGlobals());

function backend(version = "3.4.1") {
    const recover = vi.fn();
    const pool = { recover };
    vi.stubGlobal("Laya", { LayaEnv: { version }, WebGraphicsRenderUnitPool: pool,
        ShaderDefines2D: { UNIFORM_SPRITETEXTURE: 1, UNIFORM_SPRITETEXTURE_ARRAY: 2 } });
    return { pool, recover };
}

describe("LayaGraphicsCleanup", () => {
    it("drops texture and owner references before returning a unit to the native pool and restores on stop", () => {
        const { pool, recover } = backend();
        const textures = new Map([[1, {}], [2, {}]]);
        const unit = { primitiveShaderData: { setTexture: (id: number, value: object | null) => textures.set(id, value!) },
            element: { owner: {}, value2DShaderData: {}, globalShaderData: {}, materialShaderData: {} } };
        recover.mockImplementation(function (this: unknown, value) {
            expect(this).toBe(pool);
            if (!value) return;
            expect([...textures.values()]).toEqual([null, null]);
            expect(Object.values(value.element)).toEqual([null, null, null, null]);
        });
        const service = new LayaGraphicsCleanup();
        service.start(); service.start();
        pool.recover(unit); pool.recover(null);
        expect(recover).toHaveBeenCalledTimes(2);
        service.stop(); service.stop();
        expect(pool.recover).toBe(recover);
        service.start(); service.stop();
        expect(pool.recover).toBe(recover);
    });

    it("does not patch other versions or backends", () => {
        const { pool, recover } = backend("3.5.0");
        const service = new LayaGraphicsCleanup();
        service.start(); service.stop();
        expect(pool.recover).toBe(recover);
        vi.stubGlobal("Laya", { LayaEnv: { version: "3.4.1" } });
        expect(() => { service.start(); service.stop(); }).not.toThrow();
    });

    it("does not overwrite a hook installed later by another owner", () => {
        const { pool } = backend();
        const service = new LayaGraphicsCleanup();
        service.start();
        const replacement = vi.fn(); pool.recover = replacement;
        service.stop();
        expect(pool.recover).toBe(replacement);
    });
});
