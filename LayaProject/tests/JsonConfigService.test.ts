import { afterEach, describe, expect, it, vi } from "vitest";
import { ContentCatalog } from "../src/framework/infrastructure/content/ContentCatalog";
import {
    JsonConfigService,
    JsonConfigValidationError,
} from "../src/framework/infrastructure/config/JsonConfigService";

class FakeTextResource {
    constructor(readonly data: unknown) {}
}

afterEach(() => vi.unstubAllGlobals());

describe("JsonConfigService", () => {
    it("coalesces native Loader.JSON requests and releases its cache", async () => {
        const load = vi.fn().mockResolvedValue(new FakeTextResource({ width: 12, height: 8 }));
        const clearRes = vi.fn();
        vi.stubGlobal("Laya", {
            Loader: { JSON: "json" },
            TextResource: FakeTextResource,
            loader: { load, clearRes },
        });
        const service = createService();
        const isMap = (value: unknown): value is { width: number; height: number } => Boolean(
            value && typeof value === "object" && typeof (value as { width?: unknown }).width === "number",
        );

        const [first, second] = await Promise.all([
            service.load("map.level-1", isMap),
            service.load("map.level-1", isMap),
        ]);

        expect(first).toBe(second);
        expect(load).toHaveBeenCalledOnce();
        expect(load).toHaveBeenCalledWith("packages/maps/maps/level-1.json", { type: "json" });
        expect(service.require("map.level-1", isMap)).toBe(first);
        expect(service.snapshot()[0].state).toBe("loaded");
        expect(service.release("map.level-1")).toBe(true);
        expect(service.ready).toBe(false);
        expect(clearRes).toHaveBeenCalledWith("packages/maps/maps/level-1.json");
    });

    it("rejects invalid external JSON without retaining it", async () => {
        const clearRes = vi.fn();
        vi.stubGlobal("Laya", {
            Loader: { JSON: "json" },
            TextResource: FakeTextResource,
            loader: { load: vi.fn().mockResolvedValue(new FakeTextResource({ invalid: true })), clearRes },
        });
        const service = createService();

        await expect(service.load("map.level-1", (value): value is { width: number } => (
            Boolean(value && typeof value === "object" && typeof (value as { width?: unknown }).width === "number")
        ))).rejects.toBeInstanceOf(JsonConfigValidationError);
        expect(service.snapshot()).toEqual([]);
        expect(clearRes).toHaveBeenCalledOnce();
    });

    it("invalidates a late load during release and clears the resulting cache", async () => {
        let resolveLoad!: (value: unknown) => void;
        const clearRes = vi.fn();
        vi.stubGlobal("Laya", {
            Loader: { JSON: "json" },
            TextResource: FakeTextResource,
            loader: {
                load: vi.fn(() => new Promise((resolve) => { resolveLoad = resolve; })),
                clearRes,
            },
        });
        const service = createService();
        const pending = service.load("map.level-1");

        expect(service.release("map.level-1")).toBe(true);
        resolveLoad(new FakeTextResource({ width: 1 }));

        await expect(pending).rejects.toThrow("superseded");
        await service.waitForPendingLoads();
        expect(clearRes).toHaveBeenCalledTimes(2);
    });

    it("rejects content that is not declared as JSON data", async () => {
        vi.stubGlobal("Laya", {
            Loader: { JSON: "json" },
            TextResource: FakeTextResource,
            loader: { load: vi.fn(), clearRes: vi.fn() },
        });
        const content = new ContentCatalog([{ id: "window", url: "ui/window.lh", kind: "ui" }]);
        const service = new JsonConfigService(content);

        await expect(service.load("window")).rejects.toThrow("kind 'data'");
    });
});

function createService(): JsonConfigService {
    return new JsonConfigService(new ContentCatalog([{
        id: "map.level-1",
        url: "packages/maps/maps/level-1.json",
        kind: "data",
    }]));
}
