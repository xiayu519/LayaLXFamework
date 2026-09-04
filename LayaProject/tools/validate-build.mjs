import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assetsRoot = join(projectRoot, "assets");
const releaseRoot = join(projectRoot, "release", "web");
const releaseLibRoot = join(releaseRoot, "libs");
const failures = [];

function readJson(path) {
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
        failures.push(`${path}: ${error.message}`);
        return undefined;
    }
}

const buildSettings = readJson(join(projectRoot, "settings", "BuildSettings.json"));
const resourceLayout = readJson(join(projectRoot, "settings", "ResourceLayout.json"));
const bootstrapRoot = resourceLayout?.roots?.bootstrap;
if (typeof bootstrapRoot !== "string" || !buildSettings?.alwaysIncluded?.includes(bootstrapRoot)) {
    failures.push("settings/BuildSettings.json must always include the bootstrap resource root.");
}

for (const entry of buildSettings?.alwaysIncluded ?? []) {
    const sourcePath = resolve(assetsRoot, entry);
    if (sourcePath !== assetsRoot && !sourcePath.startsWith(`${assetsRoot}${sep}`)) {
        failures.push(`settings/BuildSettings.json contains an out-of-assets alwaysIncluded path: '${entry}'.`);
        continue;
    }
    if (!existsSync(sourcePath)) {
        failures.push(`alwaysIncluded source path is missing: assets/${entry}.`);
        continue;
    }
    for (const hierarchyPath of hierarchyFiles(sourcePath)) {
        const assetRelativePath = relative(assetsRoot, hierarchyPath);
        const releasePath = join(releaseRoot, assetRelativePath);
        if (!existsSync(releasePath)) {
            failures.push(`release/web/${assetRelativePath} is missing; an alwaysIncluded hierarchy asset was not collected.`);
            continue;
        }
        const sourceAsset = readJson(hierarchyPath);
        const releaseAsset = readJson(releasePath);
        if (sourceAsset?._$type !== releaseAsset?._$type) {
            failures.push(`release/web/${assetRelativePath} root type does not match its source asset.`);
        }
    }
}

const generatedConfig = typeof resourceLayout?.generatedConfig === "string" ? resourceLayout.generatedConfig : "__invalid__";
const configRoot = join(assetsRoot, generatedConfig);
for (const sourcePath of binaryFiles(configRoot)) {
    const assetRelativePath = relative(assetsRoot, sourcePath);
    const releasePath = join(releaseRoot, assetRelativePath);
    if (!existsSync(releasePath)) {
        failures.push(`release/web/${assetRelativePath} is missing; generated config was not collected.`);
    } else if (!readFileSync(sourcePath).equals(readFileSync(releasePath))) {
        failures.push(`release/web/${assetRelativePath} differs from the generated source binary.`);
    }
}

const startupUI = typeof resourceLayout?.startupUI === "string" ? resourceLayout.startupUI : "__invalid__.lh";
const statusPath = join(releaseRoot, startupUI);
if (!existsSync(statusPath)) {
    failures.push(`release/web/${startupUI} is missing; the startup UI was not collected.`);
} else {
    const statusAsset = readJson(statusPath);
    if (statusAsset?._$type !== "GWidget") {
        failures.push(`release/web/${startupUI} must export a GWidget root.`);
    }
}

const indexPath = join(releaseRoot, "js", "index.js");
if (!existsSync(indexPath)) {
    failures.push("release/web/js/index.js is missing.");
} else {
    const indexSource = readFileSync(indexPath, "utf8");
    const startupScene = resourceLayout?.startupScene;
    if (typeof startupScene !== "string" || !indexSource.includes(`"startupScene":"${startupScene}"`)) {
        failures.push("release/web/js/index.js does not point to ResourceLayout.startupScene.");
    }
    if (!indexSource.includes('"alwaysIncludeDefaultSkin":false')) {
        failures.push("release/web/js/index.js did not preserve the ui2 default-skin policy.");
    }
}

const libraryRoot = resourceLayout?.roots?.library;
if (typeof libraryRoot === "string" && existsSync(join(releaseRoot, libraryRoot))) {
    failures.push(`release/web/${libraryRoot} must not contain development template assets.`);
}
if (existsSync(join(releaseRoot, "internal", "UI"))) {
    failures.push("release/web/internal/UI must not contain unused default ui2 skins in the bootstrap package.");
}

const htmlPath = join(releaseRoot, "index.html");
const htmlSource = existsSync(htmlPath) ? readFileSync(htmlPath, "utf8") : "";
if (!htmlSource.includes("<title>LXFamework</title>")) {
    failures.push("release/web/index.html does not use the LXFamework title.");
}

const scriptSources = Array.from(htmlSource.matchAll(/<script[^>]+src=["']([^"']+)["']/gi), (match) => match[1]);
for (const requiredScript of ["libs/laya.core.js", "libs/laya.webgl_2D.js", "libs/laya.ui2.js", "libs/laya.spine.js"]) {
    if (!scriptSources.includes(requiredScript)) {
        failures.push(`release/web/index.html is missing required 2D engine script '${requiredScript}'.`);
    }
}
const forbiddenScripts = scriptSources.filter(is3DEngineFile);
if (forbiddenScripts.length > 0) {
    failures.push(`release/web/index.html includes forbidden 3D engine script(s): ${forbiddenScripts.join(", ")}.`);
}
if (!existsSync(releaseLibRoot)) {
    failures.push("release/web/libs is missing.");
} else {
    const forbiddenLibraries = readdirSync(releaseLibRoot).filter(is3DEngineFile);
    if (forbiddenLibraries.length > 0) {
        failures.push(`release/web/libs contains forbidden 3D engine file(s): ${forbiddenLibraries.join(", ")}.`);
    }
}

if (failures.length > 0) {
    console.error("Web build validation failed:");
    for (const failure of failures) {
        console.error(`- ${failure}`);
    }
    process.exitCode = 1;
} else {
    console.log("Web build OK: bootstrap assets, 2D modules, startup UI and generated config binaries are present; library assets are excluded.");
}

function hierarchyFiles(path) {
    if (statSync(path).isFile()) {
        return [".ls", ".lh"].includes(extname(path).toLowerCase()) ? [path] : [];
    }
    const files = [];
    for (const entry of readdirSync(path)) {
        files.push(...hierarchyFiles(join(path, entry)));
    }
    return files;
}

function binaryFiles(path) {
    if (!existsSync(path)) {
        return [];
    }
    if (statSync(path).isFile()) {
        return extname(path).toLowerCase() === ".bin" ? [path] : [];
    }
    const files = [];
    for (const entry of readdirSync(path)) {
        files.push(...binaryFiles(join(path, entry)));
    }
    return files;
}

function is3DEngineFile(path) {
    const name = path.replaceAll("\\", "/").split("/").at(-1) ?? "";
    return /^laya\.d3(?:\.|$)/i.test(name) || /_3D(?:\.|$)/i.test(name);
}
