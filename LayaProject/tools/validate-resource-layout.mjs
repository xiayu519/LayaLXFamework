import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assetsRoot = join(projectRoot, "assets");
const failures = [];

function portable(path) {
    return path.split(sep).join("/");
}

function readJson(path) {
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
        failures.push(`${portable(relative(projectRoot, path))}: invalid JSON (${error.message}).`);
        return undefined;
    }
}

function walk(directory) {
    if (!existsSync(directory)) {
        return [];
    }
    const files = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...walk(path));
        } else {
            files.push(path);
        }
    }
    return files;
}

function directDirectories(directory) {
    if (!existsSync(directory)) {
        return [];
    }
    return readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
}

function normalizedAssetPath(value, label) {
    if (typeof value !== "string" || value.length === 0) {
        failures.push(`${label} must be a non-empty asset-relative path.`);
        return undefined;
    }
    const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
    const segments = normalized.split("/");
    if (normalized.startsWith("/") || segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
        failures.push(`${label} must stay inside assets: '${value}'.`);
        return undefined;
    }
    return normalized;
}

function visit(value, callback) {
    if (!value || typeof value !== "object") {
        return;
    }
    callback(value);
    for (const child of Array.isArray(value) ? value : Object.values(value)) {
        visit(child, callback);
    }
}

function zoneOf(path, roots) {
    const segments = path.split("/");
    if (segments[0] === roots.bootstrap) {
        return { kind: "bootstrap" };
    }
    if (segments[0] === roots.packages && segments[1]) {
        return { kind: "package", name: segments[1] };
    }
    if (segments[0] === roots.shared && segments[1]) {
        return { kind: "shared", name: segments[1] };
    }
    if (segments[0] === roots.library) {
        return { kind: "library" };
    }
    return { kind: "unknown" };
}

const layout = readJson(join(projectRoot, "settings", "ResourceLayout.json"));
const buildSettings = readJson(join(projectRoot, "settings", "BuildSettings.json"));
const roots = layout?.roots ?? {};
const requiredRootKeys = ["bootstrap", "packages", "shared", "library"];
for (const key of requiredRootKeys) {
    const value = roots[key];
    if (typeof value !== "string" || !/^[a-z][a-z0-9-]*$/.test(value)) {
        failures.push(`settings/ResourceLayout.json: roots.${key} must be one lowercase path segment.`);
    }
}
if (layout?.version !== 1) {
    failures.push("settings/ResourceLayout.json: version must be 1.");
}
const rootValues = requiredRootKeys.map((key) => roots[key]).filter((value) => typeof value === "string");
if (new Set(rootValues).size !== rootValues.length) {
    failures.push("settings/ResourceLayout.json: resource roots must be unique.");
}
const assetTypeList = Array.isArray(layout?.assetTypes) ? layout.assetTypes : [];
const assetTypes = new Set(assetTypeList);
if (assetTypes.size === 0 || assetTypes.size !== assetTypeList.length || [...assetTypes].some((item) => typeof item !== "string" || !/^[a-z][a-z0-9-]*$/.test(item))) {
    failures.push("settings/ResourceLayout.json: assetTypes must contain unique lowercase directory names.");
}

const startupScene = normalizedAssetPath(layout?.startupScene, "settings/ResourceLayout.json startupScene");
const startupUI = normalizedAssetPath(layout?.startupUI, "settings/ResourceLayout.json startupUI");
const generatedConfig = normalizedAssetPath(layout?.generatedConfig, "settings/ResourceLayout.json generatedConfig");
for (const [label, path] of [["startupScene", startupScene], ["startupUI", startupUI], ["generatedConfig", generatedConfig]]) {
    if (path && !existsSync(join(assetsRoot, path))) {
        failures.push(`settings/ResourceLayout.json ${label} is missing: assets/${path}.`);
    }
}
if (startupScene && !startupScene.startsWith(`${roots.bootstrap}/`)) {
    failures.push("settings/ResourceLayout.json: startupScene must be inside the bootstrap root.");
}
if (startupUI && !startupUI.startsWith(`${roots.bootstrap}/`)) {
    failures.push("settings/ResourceLayout.json: startupUI must be inside the bootstrap root.");
}
if (generatedConfig && !generatedConfig.startsWith(`${roots.bootstrap}/`)) {
    failures.push("settings/ResourceLayout.json: generatedConfig must be inside the bootstrap root.");
}

const topLevelEntries = readdirSync(assetsRoot, { withFileTypes: true });
const allowedRoots = new Set(rootValues);
for (const entry of topLevelEntries) {
    const directoryMeta = entry.isFile() && entry.name.endsWith(".meta") && allowedRoots.has(entry.name.slice(0, -5));
    if (!allowedRoots.has(entry.name) && !directoryMeta) {
        failures.push(`assets/${entry.name}: runtime assets must use bootstrap, packages/<feature>, shared/<domain>, or library.`);
    }
}

function validateTypeDirectories(containerPath, label) {
    if (!existsSync(containerPath)) {
        return;
    }
    for (const entry of readdirSync(containerPath, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (!assetTypes.has(entry.name)) {
                failures.push(`${label}/${entry.name}: unknown asset type directory.`);
            }
            continue;
        }
        const directoryMeta = entry.name.endsWith(".meta") && assetTypes.has(entry.name.slice(0, -5));
        if (!directoryMeta) {
            failures.push(`${label}/${entry.name}: files must be placed below an asset type directory.`);
        }
    }
}

validateTypeDirectories(join(assetsRoot, roots.bootstrap ?? ""), `assets/${roots.bootstrap}`);
for (const rootKey of ["packages", "shared"]) {
    const rootName = roots[rootKey];
    if (typeof rootName !== "string") {
        continue;
    }
    const rootPath = join(assetsRoot, rootName);
    if (!existsSync(rootPath)) {
        continue;
    }
    for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith(".meta")) {
            continue;
        }
        if (!entry.isDirectory() || !/^[a-z][a-z0-9-]*$/.test(entry.name)) {
            failures.push(`assets/${rootName}/${entry.name}: package id must be a lowercase directory name.`);
            continue;
        }
        validateTypeDirectories(join(rootPath, entry.name), `assets/${rootName}/${entry.name}`);
    }
}

const allAssetFiles = walk(assetsRoot);
for (const path of allAssetFiles) {
    if (path.endsWith(".meta")) {
        continue;
    }
    const local = portable(relative(assetsRoot, path));
    const zone = zoneOf(local, roots);
    if (!["bootstrap", "package", "shared"].includes(zone.kind)) {
        continue;
    }
    const segments = local.split("/");
    const typeIndex = zone.kind === "bootstrap" ? 1 : 2;
    const type = segments[typeIndex];
    const extension = extname(path).toLowerCase();
    if (extension === ".ls" && type !== "scenes") {
        failures.push(`assets/${local}: .ls scenes belong in the scenes directory.`);
    }
    if (extension === ".lh" && !["ui", "prefabs", "spine", "effects"].includes(type)) {
        failures.push(`assets/${local}: .lh prefabs belong in ui, prefabs, spine/<name>, or effects.`);
    }
    if (type === "spine" && segments.length < typeIndex + 3) {
        failures.push(`assets/${local}: Spine prefab and skeleton files must be co-located under spine/<name>/.`);
    }
}

const metaByUuid = new Map();
for (const path of [...allAssetFiles, ...walk(join(projectRoot, "src"))].filter((item) => item.endsWith(".meta"))) {
    const meta = readJson(path);
    if (typeof meta?.uuid === "string") {
        metaByUuid.set(meta.uuid, portable(relative(projectRoot, path.slice(0, -5))));
    }
}
for (const path of allAssetFiles.filter((item) => [".ls", ".lh"].includes(extname(item).toLowerCase()))) {
    const local = portable(relative(assetsRoot, path));
    const sourceZone = zoneOf(local, roots);
    if (!["bootstrap", "package", "shared"].includes(sourceZone.kind)) {
        continue;
    }
    const asset = readJson(path);
    visit(asset, (node) => {
        for (const value of Object.values(node)) {
            if (typeof value !== "string" || !value.startsWith("res://")) {
                continue;
            }
            const target = metaByUuid.get(value.slice(6));
            if (!target || target.startsWith("src/")) {
                continue;
            }
            const targetAsset = target.startsWith("assets/") ? target.slice(7) : target;
            const targetZone = zoneOf(targetAsset, roots);
            const allowed = sourceZone.kind === "bootstrap"
                ? targetZone.kind === "bootstrap"
                : sourceZone.kind === "package"
                    ? (targetZone.kind === "package" && targetZone.name === sourceZone.name) || targetZone.kind === "shared"
                    : targetZone.kind === "shared" && targetZone.name === sourceZone.name;
            if (!allowed) {
                failures.push(`assets/${local}: resource reference '${target}' crosses its package boundary.`);
            }
        }
    });
}

const alwaysIncluded = Array.isArray(buildSettings?.alwaysIncluded) ? buildSettings.alwaysIncluded : [];
if (alwaysIncluded.length !== 1 || alwaysIncluded[0] !== roots.bootstrap) {
    failures.push(`settings/BuildSettings.json: alwaysIncluded must contain only '${roots.bootstrap}'.`);
}
const startupMeta = startupScene ? readJson(join(assetsRoot, `${startupScene}.meta`)) : undefined;
if (!startupMeta?.uuid || buildSettings?.startupScene !== `res://${startupMeta.uuid}`) {
    failures.push("settings/BuildSettings.json: startupScene must resolve to ResourceLayout.startupScene.");
}

const sourcePackagePaths = [];
for (const rootKey of ["packages", "shared"]) {
    const rootName = roots[rootKey];
    if (typeof rootName === "string") {
        sourcePackagePaths.push(...directDirectories(join(assetsRoot, rootName)).map((name) => `${rootName}/${name}`));
    }
}
const configuredSubpackages = Array.isArray(buildSettings?.subpackages) ? buildSettings.subpackages : [];
if (sourcePackagePaths.length === 0) {
    if (buildSettings?.enableSubpackages !== false || configuredSubpackages.length !== 0) {
        failures.push("settings/BuildSettings.json: keep subpackages disabled until a feature/shared package exists.");
    }
} else if (buildSettings?.enableSubpackages !== true) {
    failures.push("settings/BuildSettings.json: enableSubpackages must be true when resource packages exist.");
}
const configuredPaths = new Set();
for (const entry of configuredSubpackages) {
    const path = normalizedAssetPath(entry?.path, "settings/BuildSettings.json subpackage.path");
    if (!path) {
        continue;
    }
    if (configuredPaths.has(path)) {
        failures.push(`settings/BuildSettings.json: duplicate subpackage '${path}'.`);
    }
    configuredPaths.add(path);
    if (!sourcePackagePaths.includes(path)) {
        failures.push(`settings/BuildSettings.json: subpackage '${path}' is not a direct feature/shared package.`);
    }
    if (entry.packAllAssets !== true) {
        failures.push(`settings/BuildSettings.json: subpackage '${path}' must set packAllAssets=true.`);
    }
    if (entry.autoLoad === true) {
        failures.push(`settings/BuildSettings.json: subpackage '${path}' must not auto-load before first interaction.`);
    }
}
for (const path of sourcePackagePaths) {
    if (!configuredPaths.has(path)) {
        failures.push(`settings/BuildSettings.json: source package '${path}' is not configured as a subpackage.`);
    }
}

if (failures.length > 0) {
    console.error("Resource layout validation failed:");
    for (const failure of failures) {
        console.error(`- ${failure}`);
    }
    process.exitCode = 1;
} else {
    console.log(`Resource layout OK: bootstrap is the only base resource root; ${sourcePackagePaths.length} lazy package(s) configured.`);
}
