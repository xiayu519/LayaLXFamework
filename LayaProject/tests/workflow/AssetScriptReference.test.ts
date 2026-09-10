import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { resolveComponentScript } from "../../tools/asset-script-reference.mjs";

const project = resolve("asset-script-reference-fixture");
const assets = resolve(project, "assets");
const hierarchy = resolve(assets, "bootstrap/ui/Window.lh");
const nativeScript = resolve(project, "src/Binding.ts");
const read = (scripts: Record<string, string>) => (path: string): string | undefined => scripts[path];

describe("native asset component script references", () => {
    it("resolves IDE output relative to assets even for a deeply nested prefab", () => {
        expect(resolveComponentScript(assets, hierarchy, "../src/Binding.ts", "binding-id",
            read({ [nativeScript]: "binding-id" }))).toBe(nativeScript);
    });

    it("accepts legacy paths relative to the hierarchy only when their UUID matches", () => {
        expect(resolveComponentScript(assets, hierarchy, "../../../src/Binding.ts", "binding-id",
            read({ [nativeScript]: "binding-id" }))).toBe(nativeScript);
        expect(() => resolveComponentScript(assets, hierarchy, "../../../src/Binding.ts", "wrong-id",
            read({ [nativeScript]: "binding-id" }))).toThrow("uuid does not match");
    });

    it("stops after a valid native reference without inspecting an unrelated legacy file", () => {
        expect(resolveComponentScript(assets, hierarchy, "../src/Binding.ts", "binding-id", (path) => {
            if (path === nativeScript) return "binding-id";
            throw new Error("Unrelated legacy metadata must not be read.");
        })).toBe(nativeScript);
    });

    it("does not accept an existing native path as proof of a matching script", () => {
        expect(() => resolveComponentScript(assets, hierarchy, "../src/Binding.ts", "wrong-id",
            read({ [nativeScript]: "binding-id" }))).toThrow("uuid does not match");
    });

    it("falls back past a same-named file only when the referenced UUID resolves", () => {
        const legacyScript = resolve(assets, "bootstrap/src/Binding.ts");
        const scripts = read({ [nativeScript]: "other-id", [legacyScript]: "binding-id" });
        expect(resolveComponentScript(assets, hierarchy, "../src/Binding.ts", "binding-id", scripts))
            .toBe(legacyScript);
    });

    it("reports missing source or metadata without silently accepting the UUID", () => {
        expect(() => resolveComponentScript(assets, hierarchy, "../src/Binding.ts", "binding-id", read({})))
            .toThrow("is missing");
    });
});
