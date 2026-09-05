import { describe, expect, it } from "vitest";
import { resolve, sep } from "node:path";
import {
    analyzeModuleDependencies,
    findDependencyCycles,
    readArchitectureCompilerOptions,
} from "../../tools/architecture-analysis.mjs";

describe("architecture module analysis", () => {
    it("resolves side effects, re-exports, dynamic imports, require and import=require using tsconfig aliases", () => {
        const fixture = createFixture({
            "src/framework/entry.ts": [
                'import "@game/feature";',
                'export { value } from "@game/feature";',
                'const lazy = import("@game/feature");',
                'const common = require("@game/feature");',
                'import compat = require("@game/feature");',
            ].join("\n"),
            "src/game/feature.ts": "export const value = 1;",
        });
        const analysis = fixture.analyze("src/framework/entry.ts");
        expect(analysis.diagnostics).toEqual([]);
        expect(analysis.dependencies.map((edge) => edge.syntax))
            .toEqual(["import", "export", "dynamic import", "require", "import=require"]);
        expect(analysis.dependencies.every((edge) => edge.runtime && edge.target === fixture.path("src/game/feature.ts")))
            .toBe(true);
    });

    it("preserves type-only ownership edges while excluding them from runtime cycles", () => {
        const fixture = createFixture({
            "src/a.ts": [
                'import type { Shape } from "./b";',
                'import { type Shape as OtherShape } from "./b";',
                'export type { Shape } from "./b";',
                'export { type Shape as PublicShape } from "./b";',
                'type Alias = import("./b").Shape;',
            ].join("\n"),
            "src/b.ts": 'import "./a"; export interface Shape {}',
        });
        const a = fixture.analyze("src/a.ts");
        expect(a.diagnostics).toEqual([]);
        expect(a.dependencies).toHaveLength(5);
        expect(a.dependencies.every((edge) => !edge.runtime && edge.target === fixture.path("src/b.ts"))).toBe(true);
        expect(findDependencyCycles(fixture.graph())).toEqual([]);
    });

    it("detects cycles through dynamic imports and re-exports without confusing mixed type imports", () => {
        const fixture = createFixture({
            "src/a.ts": 'import { type Shape, value } from "./b";',
            "src/b.ts": 'export { next } from "./c"; export interface Shape {} export const value = 1;',
            "src/c.ts": 'export const next = import("./a");',
        });
        expect(fixture.analyze("src/a.ts").dependencies[0].runtime).toBe(true);
        expect(findDependencyCycles(fixture.graph())).toEqual([[
            fixture.path("src/a.ts"), fixture.path("src/b.ts"), fixture.path("src/c.ts"), fixture.path("src/a.ts"),
        ]]);
    });

    it("reports nonliteral and unresolved local dependencies instead of silently dropping them", () => {
        const fixture = createFixture({
            "src/a.ts": [
                'const file = "./feature";',
                'import(file);',
                'require(`./${file}`);',
                'import "./missing";',
                'import "@game/missing";',
            ].join("\n"),
        });
        const analysis = fixture.analyze("src/a.ts");
        expect(analysis.diagnostics).toHaveLength(4);
        expect(analysis.diagnostics[0]).toContain("Cannot statically resolve dynamic import");
        expect(analysis.diagnostics[1]).toContain("Cannot statically resolve require");
        expect(analysis.diagnostics[2]).toContain("./missing");
        expect(analysis.diagnostics[3]).toContain("@game/missing");
    });

    it("ignores commented imports and strings while resolving .js specifiers to TypeScript and index files", () => {
        const fixture = createFixture({
            "src/a.ts": [
                '// import "./missing";',
                'const text = `export { broken } from "./missing"`;',
                'import "./b.js";',
                'import("./folder");',
                'import "node:fs";',
            ].join("\n"),
            "src/b.ts": "export {};",
            "src/folder/index.ts": "export {};",
        });
        const analysis = fixture.analyze("src/a.ts");
        expect(analysis.diagnostics).toEqual([]);
        expect(analysis.dependencies.map((edge) => edge.target))
            .toEqual([fixture.path("src/b.ts"), fixture.path("src/folder/index.ts"), undefined]);
        expect(analysis.dependencies[2].external).toBe(true);
    });
});

function createFixture(sources: Record<string, string>) {
    const root = resolve("architecture-analysis-fixture");
    const path = (file: string): string => resolve(root, file);
    const files = new Map(Object.entries(sources).map(([file, text]) => [path(file), text]));
    files.set(path("tsconfig.json"), JSON.stringify({
        compilerOptions: {
            module: "ESNext", moduleResolution: "Bundler", baseUrl: ".", paths: { "@game/*": ["src/game/*"] },
        },
        include: ["src/**/*.ts"],
    }));
    const host = {
        useCaseSensitiveFileNames: true,
        fileExists: (file: string): boolean => files.has(resolve(file)),
        readFile: (file: string): string | undefined => files.get(resolve(file)),
        readDirectory: (): string[] => [...files.keys()].filter((file) => file.endsWith(".ts")),
        directoryExists: (directory: string): boolean => [...files.keys()].some((file) => file.startsWith(`${resolve(directory)}${sep}`)),
        getCurrentDirectory: (): string => root,
        realpath: (file: string): string => resolve(file),
    };
    const config = readArchitectureCompilerOptions(root, host);
    expect(config.diagnostics).toEqual([]);
    const analyze = (file: string) => analyzeModuleDependencies(path(file), files.get(path(file)) ?? "", config.options, host);
    const graph = (): Map<string, string[]> => new Map(Object.keys(sources).map((file) => [
        path(file), analyze(file).dependencies.flatMap((edge) => edge.runtime && edge.target ? [edge.target] : []),
    ]));
    return { path, analyze, graph };
}
