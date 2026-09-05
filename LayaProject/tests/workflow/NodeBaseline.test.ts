import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Node runtime baseline", () => {
    it("keeps CI, lock and distribution on the project-supported Node major", () => {
        const read = (path: string) => readFileSync(path, "utf8");
        const pkg = JSON.parse(read("package.json"));
        const lock = JSON.parse(read("package-lock.json"));
        const manifest = JSON.parse(read("../framework.manifest.json"));
        const major = /^\^(\d+)\.0\.0$/.exec(pkg.engines.node)?.[1];
        expect(major).toBeDefined();
        expect(lock.packages[""].engines.node).toBe(pkg.engines.node);
        expect(manifest.jsonContracts["LayaProject/package.json"].engines.node).toBe(pkg.engines.node);
        expect(read("../.github/workflows/framework-sync.yml").match(/node-version:\s*(\d+)/)?.[1])
            .toBe(major);
        // The pinned Vitest toolchain accepts 24.x; keep this explicit when upgrading tools.
        expect(major).toBe("24");
        expect(lock.packages["node_modules/vitest"].engines.node).toContain("^24.0.0");
    });
});
