import { describe, expect, it } from "vitest";
import { ContentCatalog } from "../../src/framework/infrastructure/content/ContentCatalog";

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
