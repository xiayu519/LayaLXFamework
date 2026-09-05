import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeModuleDependencies, findDependencyCycles, readArchitectureCompilerOptions } from "./architecture-analysis.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(projectRoot, "src");
const failures = [];
const warnings = [];
const dependencyGraph = new Map();
const architecturalLayers = new Set(["application", "bootstrap", "domain", "generated", "infrastructure", "presentation", "platform"]);
const layerDependencies = {
    domain: new Set(["domain"]),
    application: new Set(["application", "domain"]),
    infrastructure: new Set(["infrastructure", "application", "domain"]),
    presentation: new Set(["presentation", "application", "domain"]),
    platform: new Set(["platform", "domain"]),
    bootstrap: new Set(["bootstrap", "application", "domain", "infrastructure", "presentation", "platform", "root"]),
    root: new Set(["root", "bootstrap"]),
};
const frameworkAccessFromGame = {
    domain: new Set(["domain"]),
    application: new Set(["application", "domain"]),
    infrastructure: new Set(["infrastructure", "application", "domain", "root"]),
    presentation: new Set(["presentation", "application", "domain", "root"]),
    platform: new Set(["platform", "domain", "root"]),
    bootstrap: new Set(["bootstrap", "application", "domain", "infrastructure", "presentation", "platform", "root"]),
    root: new Set(["root"]),
};
const mainPath = join(sourceRoot, "Main.ts");
const lxPath = join(sourceRoot, "framework", "LX.ts");
const gameCompositionBridgePath = join(sourceRoot, "game", "bootstrap", "createApplication.ts");
const runtimeHostPath = join(sourceRoot, "framework", "bootstrap", "LXRuntimeHost");
const runtimeHostCallers = new Set([
    lxPath,
    join(sourceRoot, "framework", "bootstrap", "createRuntime.ts"),
]);

function walk(directory) {
    const files = [];
    for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) {
            files.push(...walk(path));
        } else if (extname(path) === ".ts") {
            files.push(path);
        }
    }
    return files;
}

function locationOf(path) {
    const parts = relative(sourceRoot, path).split(sep);
    if (parts[0] === "framework" || parts[0] === "game") {
        if (parts[0] === "game" && parts[1] && !architecturalLayers.has(parts[1])) {
            return {
                scope: "game",
                gameId: parts[1],
                layer: parts[2] === "generated" ? "infrastructure" : (parts[2] ?? "root"),
            };
        }
        return {
            scope: parts[0],
            gameId: parts[0] === "game" ? "legacy" : undefined,
            layer: parts[0] === "game" && parts[1] === "generated"
                ? "infrastructure"
                : (parts.length > 2 ? parts[1] : "root"),
        };
    }
    return { scope: "root", layer: "root" };
}

function localPath(path) {
    return relative(projectRoot, path);
}

for (const required of [join(sourceRoot, "framework"), join(sourceRoot, "game"), mainPath, lxPath]) {
    if (!existsSync(required)) {
        failures.push(`Required architecture path is missing: ${localPath(required)}.`);
    }
}

const sourceFiles = walk(sourceRoot);
const sourceFileSet = new Set(sourceFiles.map((file) => resolve(file)));
const config = readArchitectureCompilerOptions(projectRoot);
failures.push(...config.diagnostics);
for (const file of sourceFiles) {
    const source = readFileSync(file, "utf8");
    const sourceLocation = locationOf(file);
    const isGenerated = relative(sourceRoot, file).split(sep).includes("generated");
    const lineCount = source.split(/\r?\n/).length;
    if (!isGenerated && lineCount > 800) {
        failures.push(`${localPath(file)}: ${lineCount} lines exceeds the 800-line maintainability limit.`);
    } else if (!isGenerated && lineCount > 500) {
        warnings.push(`${localPath(file)}: ${lineCount} lines; review whether it has more than one reason to change.`);
    }
    if (/^\s*\/\/\s*@ts-(?:nocheck|ignore)\b/m.test(source)) {
        failures.push(`${localPath(file)}: @ts-nocheck and @ts-ignore are forbidden.`);
    }
    if (/\bSpineSkeleton\b/.test(source)) {
        failures.push(`${localPath(file)}: deprecated SpineSkeleton is forbidden; use Sprite with Spine2DRenderNode.`);
    }
    if (/\._(?:addReference|removeReference|clearReference)\b/.test(source)) {
        failures.push(`${localPath(file)}: private Laya resource reference APIs are forbidden.`);
    }
    if (/new\s+Laya\.Timer\b/.test(source)) {
        failures.push(`${localPath(file)}: use the engine-owned Laya.timer instead of creating another Timer.`);
    }
    const dependencies = [];
    if ((sourceLocation.layer === "domain" || sourceLocation.layer === "application")
        && /\b(Laya|window|document|navigator)\b/.test(source)) {
        failures.push(`${localPath(file)}: pure layers cannot reference engine or browser globals.`);
    }

    const analysis = analyzeModuleDependencies(file, source, config.options);
    failures.push(...analysis.diagnostics);
    for (const edge of analysis.dependencies) {
        if (edge.external || !edge.target) continue;
        const specifier = edge.specifier;
        const sourceTarget = edge.target;
        if (edge.runtime && sourceFileSet.has(sourceTarget)) dependencies.push(sourceTarget);
        if (!sourceFileSet.has(sourceTarget) && !/\.d\.[cm]?ts$/.test(sourceTarget)) {
            failures.push(`${localPath(file)}:${edge.line}: local dependency '${specifier}' is outside the checked source tree.`);
        }
        const target = sourceTarget.replace(/\.[cm]?[jt]sx?$/, "");
        const targetLocation = locationOf(target);

        if (target === runtimeHostPath && !runtimeHostCallers.has(file)) {
            failures.push(`${localPath(file)}: LXRuntimeHost is private to framework runtime bootstrap.`);
        }

        if (sourceLocation.scope === "root") {
            const targetRelative = relative(sourceRoot, target).split(sep).join("/");
            if (file !== mainPath
                || (targetRelative !== "framework/LX" && targetRelative !== "game/bootstrap/createApplication")) {
                failures.push(`${localPath(file)}: root entry may only import game bootstrap and the LX facade.`);
            }
            continue;
        }

        if (sourceLocation.scope === "framework" && targetLocation.scope === "game") {
            failures.push(`${localPath(file)}: shared framework cannot depend on game business code.`);
            continue;
        }

        if (sourceLocation.scope === targetLocation.scope) {
            if (sourceLocation.scope === "game" && sourceLocation.gameId !== targetLocation.gameId) {
                const isCompositionBridge = file === gameCompositionBridgePath
                    && sourceLocation.gameId === "legacy"
                    && sourceLocation.layer === "bootstrap";
                if (!isCompositionBridge) {
                    failures.push(
                        `${localPath(file)}: game '${sourceLocation.gameId}' cannot import game '${targetLocation.gameId}' (${specifier}).`,
                    );
                    continue;
                }
            }
            const allowed = layerDependencies[sourceLocation.layer];
            if (allowed && !allowed.has(targetLocation.layer)) {
                failures.push(
                    `${localPath(file)}: ${sourceLocation.scope}/${sourceLocation.layer} cannot import `
                    + `${targetLocation.scope}/${targetLocation.layer} (${specifier}).`,
                );
            }
            continue;
        }

        if (sourceLocation.scope === "game" && targetLocation.scope === "framework") {
            const allowed = frameworkAccessFromGame[sourceLocation.layer];
            if (!allowed?.has(targetLocation.layer)) {
                failures.push(
                    `${localPath(file)}: game/${sourceLocation.layer} cannot import `
                    + `framework/${targetLocation.layer} (${specifier}).`,
                );
            }
        }
    }
    dependencyGraph.set(resolve(file), dependencies);

    if (/new\s+Laya\.(?:GWidget|GTextField|GButton|GImage|Label|Image)\b/.test(source)) {
        failures.push(`${localPath(file)}: fixed UI nodes must come from .ls/.lh assets.`);
    }
    if (/\b(?:Event|Timer|Tween|Pool|Loader|LocalStorage)Manager\b/.test(source)) {
        failures.push(`${localPath(file)}: duplicates a Laya built-in manager.`);
    }
    if (/\b(?:new|extends)\s+LXFamework\b|\bimport\s*\{[^}]*\bLXFamework\b/.test(source)) {
        failures.push(`${localPath(file)}: runtime code must expose and consume LX, not a LXFamework class.`);
    }
}

for (const cycle of findDependencyCycles(dependencyGraph)) {
    failures.push(`TypeScript dependency cycle: ${cycle.map(localPath).join(" -> ")}.`);
}

if (existsSync(lxPath)) {
    const lxSource = readFileSync(lxPath, "utf8");
    const exports = Array.from(
        lxSource.matchAll(/^export\s+(?:class|const|function|interface|type)\s+(\w+)/gm),
        (match) => match[1],
    );
    if (exports.length !== 1 || exports[0] !== "LX") {
        failures.push("src/framework/LX.ts must export only the LX runtime facade.");
    }
}

if (failures.length > 0) {
    console.error("Architecture check failed:");
    for (const failure of failures) {
        console.error(`- ${failure}`);
    }
    process.exitCode = 1;
} else {
    for (const warning of warnings) {
        console.warn(`Architecture review: ${warning}`);
    }
    console.log("Architecture OK: ownership, dependency direction, cycles, file size, type-safety and Laya 2D rules passed.");
}
