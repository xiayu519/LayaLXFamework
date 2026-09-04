import { describe, expect, it } from "vitest";
import { SimulationClock } from "../src/framework/domain/time/SimulationClock";
import { ServerClock } from "../src/framework/domain/time/ServerClock";
import { ContentCatalog } from "../src/framework/infrastructure/content/ContentCatalog";

describe("time models", () => {
    it("clamps simulation spikes and applies time scale", () => {
        const clock = new SimulationClock(100);
        clock.timeScale = 0.5;
        expect(clock.tick(500)).toEqual({ deltaMs: 50, elapsedMs: 50 });
        clock.paused = true;
        expect(clock.tick(20).deltaMs).toBe(0);
    });

    it("maps local monotonic time to synchronized server time", () => {
        const clock = new ServerClock();
        clock.synchronize(10_000, 1_000);
        expect(clock.now(1_250)).toBe(10_250);
    });
});

describe("ContentCatalog", () => {
    it("rejects duplicate ids and fails loudly for missing content", () => {
        expect(() => new ContentCatalog([
            { id: "same", url: "one", kind: "ui" },
            { id: "same", url: "two", kind: "scene" },
        ])).toThrow("Duplicate content id");

        const catalog = new ContentCatalog([{ id: "known", url: "known.lh", kind: "ui" }]);
        expect(catalog.get("known").url).toBe("known.lh");
        expect(() => catalog.get("missing")).toThrow("Unknown content id");
    });
});
