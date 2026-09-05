import type ts from "typescript";

export interface ModuleDependency {
    readonly specifier: string;
    readonly target?: string;
    readonly external: boolean;
    readonly runtime: boolean;
    readonly syntax: string;
    readonly line: number;
}

export function isAllowedGameScopeDependency(
    sourceGameId: string,
    targetGameId: string,
    isCompositionBridge?: boolean,
): boolean;

export function readArchitectureCompilerOptions(projectRoot: string, host?: ts.ParseConfigHost): {
    readonly options: ts.CompilerOptions;
    readonly diagnostics: readonly string[];
};

export function analyzeModuleDependencies(
    fileName: string,
    source: string,
    compilerOptions: ts.CompilerOptions,
    host?: ts.ModuleResolutionHost,
): { readonly dependencies: readonly ModuleDependency[]; readonly diagnostics: readonly string[] };

export function findDependencyCycles(graph: ReadonlyMap<string, readonly string[]>): string[][];
