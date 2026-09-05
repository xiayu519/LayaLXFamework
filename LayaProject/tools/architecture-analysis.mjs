import { isBuiltin } from "node:module";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";

export function readArchitectureCompilerOptions(projectRoot, host = ts.sys) {
    const configPath = join(projectRoot, "tsconfig.json");
    const config = ts.readConfigFile(configPath, host.readFile);
    if (config.error) {
        return { options: {}, diagnostics: [formatDiagnostic(config.error)] };
    }
    const parsed = ts.parseJsonConfigFileContent(config.config, host, projectRoot, {}, configPath);
    return { options: parsed.options, diagnostics: parsed.errors.map(formatDiagnostic) };
}

/** Analyze real syntax; type edges still constrain ownership, but never form runtime cycles. */
export function analyzeModuleDependencies(fileName, source, compilerOptions, host = ts.sys) {
    const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
    const dependencies = [];
    const diagnostics = sourceFile.parseDiagnostics.map(formatDiagnostic);
    const cache = ts.createModuleResolutionCache(dirname(fileName), (path) => path, compilerOptions);
    const add = (expression, runtime, syntax, node) => {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        const location = `${fileName}:${line + 1}:${character + 1}`;
        if (!expression || (!ts.isStringLiteral(expression) && !ts.isNoSubstitutionTemplateLiteral(expression))) {
            diagnostics.push(`${location}: Cannot statically resolve ${syntax} dependency; use a literal module path.`);
            return;
        }
        const specifier = expression.text;
        if (isBuiltin(specifier)) {
            dependencies.push({ specifier, runtime, syntax, external: true, line: line + 1 });
            return;
        }
        const result = ts.resolveModuleName(specifier, fileName, compilerOptions, host, cache).resolvedModule;
        if (!result) {
            diagnostics.push(`${location}: Cannot resolve ${syntax} module '${specifier}' with tsconfig.`);
            return;
        }
        dependencies.push({
            specifier,
            target: resolve(result.resolvedFileName),
            external: result.isExternalLibraryImport === true,
            runtime,
            syntax,
            line: line + 1,
        });
    };
    const visit = (node) => {
        if (ts.isImportDeclaration(node)) {
            const clause = node.importClause;
            const named = clause?.namedBindings;
            const typesOnly = clause?.isTypeOnly || (!clause?.name && named && ts.isNamedImports(named)
                && named.elements.length > 0 && named.elements.every((element) => element.isTypeOnly));
            add(node.moduleSpecifier, !typesOnly, "import", node);
        } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
            const named = node.exportClause;
            const typesOnly = node.isTypeOnly || (named && ts.isNamedExports(named)
                && named.elements.length > 0 && named.elements.every((element) => element.isTypeOnly));
            add(node.moduleSpecifier, !typesOnly, "export", node);
        } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
            add(node.moduleReference.expression, !node.isTypeOnly, "import=require", node);
        } else if (ts.isImportTypeNode(node)) {
            add(ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined, false, "import type", node);
        } else if (ts.isCallExpression(node)) {
            if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
                add(node.arguments[0], true, "dynamic import", node);
            } else if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
                add(node.arguments[0], true, "require", node);
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return { dependencies, diagnostics };
}

export function findDependencyCycles(graph) {
    const cycles = [];
    const state = new Map();
    const stack = [];
    const reported = new Set();
    const visit = (node) => {
        state.set(node, 1);
        stack.push(node);
        for (const target of graph.get(node) ?? []) {
            if (state.get(target) === 1) {
                const cycle = [...stack.slice(stack.indexOf(target)), target];
                const key = cycle.slice(0, -1).sort().join("|");
                if (!reported.has(key)) {
                    reported.add(key);
                    cycles.push(cycle);
                }
            } else if (!state.has(target)) {
                visit(target);
            }
        }
        stack.pop();
        state.set(node, 2);
    };
    for (const node of graph.keys()) {
        if (!state.has(node)) visit(node);
    }
    return cycles;
}

function formatDiagnostic(diagnostic) {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
    if (!diagnostic.file || diagnostic.start === undefined) return message;
    const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    return `${diagnostic.file.fileName}:${line + 1}:${character + 1}: ${message}`;
}
