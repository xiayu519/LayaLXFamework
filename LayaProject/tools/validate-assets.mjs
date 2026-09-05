import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assetsRoot = join(projectRoot, "assets");
const sourceRoot = join(projectRoot, "src");
const failures = [];
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--laya")) {
    throw new Error("Usage: node tools/validate-assets.mjs [--laya]");
}
const useLayaParser = args[0] === "--laya";

function walk(directory) {
    const files = [];
    for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) {
            files.push(...walk(path));
        } else {
            files.push(path);
        }
    }
    return files;
}

function readJson(path) {
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
        failures.push(`${relative(projectRoot, path)}: invalid JSON (${error.message}).`);
        return undefined;
    }
}

function visit(value, callback) {
    if (!value || typeof value !== "object") {
        return;
    }
    callback(value);
    if (Array.isArray(value)) {
        for (const item of value) {
            visit(item, callback);
        }
        return;
    }
    for (const child of Object.values(value)) {
        visit(child, callback);
    }
}

const allFiles = walk(assetsRoot);
const metadataFiles = allFiles.concat(walk(sourceRoot)).filter((file) => file.endsWith(".meta"));
const metaByUuid = new Map();
for (const path of metadataFiles) {
    const meta = readJson(path);
    if (!meta || typeof meta.uuid !== "string") {
        failures.push(`${relative(projectRoot, path)}: meta uuid is missing.`);
        continue;
    }
    const previous = metaByUuid.get(meta.uuid);
    if (previous) {
        failures.push(`${relative(projectRoot, path)}: duplicate uuid '${meta.uuid}' also used by ${previous}.`);
    } else {
        metaByUuid.set(meta.uuid, relative(projectRoot, path));
    }
    const sourcePath = path.slice(0, -".meta".length);
    if (!existsSync(sourcePath)) {
        failures.push(`${relative(projectRoot, path)}: orphan meta without source asset.`);
    }
}

const hierarchyFiles = allFiles.filter((path) => path.endsWith(".ls") || path.endsWith(".lh"));
for (const path of hierarchyFiles) {
    const asset = readJson(path);
    if (!asset) {
        continue;
    }
    const localPath = relative(projectRoot, path);
    if (asset._$ver !== 1 || typeof asset._$id !== "string" || typeof asset._$type !== "string") {
        failures.push(`${localPath}: hierarchy root needs _$ver=1, _$id and _$type.`);
    }
    if (path.endsWith(".lh") && !asset._$type.startsWith("G")) {
        failures.push(`${localPath}: ui2 .lh root type must start with 'G'.`);
    }

    const ids = new Set();
    const refs = [];
    visit(asset, (node) => {
        if (typeof node._$id === "string") {
            if (ids.has(node._$id)) {
                failures.push(`${localPath}: duplicate local node id '${node._$id}'.`);
            }
            ids.add(node._$id);
        }
        if (typeof node._$ref === "string") {
            refs.push(node._$ref);
        }
        for (const value of Object.values(node)) {
            if (typeof value === "string" && value.startsWith("res://")) {
                const uuid = value.slice("res://".length);
                if (!metaByUuid.has(uuid)) {
                    failures.push(`${localPath}: unresolved asset uuid '${uuid}'.`);
                }
            }
        }
        const components = Array.isArray(node._$comp) ? node._$comp : [];
        for (const component of components) {
            if (typeof component.scriptPath !== "string") {
                continue;
            }
            const scriptPath = resolve(dirname(path), component.scriptPath);
            const metaPath = `${scriptPath}.meta`;
            if (!existsSync(scriptPath) || !existsSync(metaPath)) {
                failures.push(`${localPath}: script component path '${component.scriptPath}' is missing.`);
                continue;
            }
            const scriptMeta = readJson(metaPath);
            if (scriptMeta?.uuid !== component._$type) {
                failures.push(`${localPath}: script component uuid does not match ${relative(projectRoot, metaPath)}.`);
            }
        }
    });
    for (const ref of refs) {
        if (!ids.has(ref)) {
            failures.push(`${localPath}: unresolved local _$ref '${ref}'.`);
        }
    }
}

const buildSettings = readJson(join(projectRoot, "settings", "BuildSettings.json"));
const resourceLayout = readJson(join(projectRoot, "settings", "ResourceLayout.json"));
const startupUuid = buildSettings?.startupScene?.replace(/^res:\/\//, "");
if (!startupUuid || !metaByUuid.has(startupUuid)) {
    failures.push("settings/BuildSettings.json: startupScene uuid is unresolved.");
}
if (buildSettings?.name !== "LXFamework") {
    failures.push("settings/BuildSettings.json: project name must be 'LXFamework'.");
}
const bootstrapRoot = resourceLayout?.roots?.bootstrap;
if (typeof bootstrapRoot !== "string" || !buildSettings?.alwaysIncluded?.includes(bootstrapRoot)) {
    failures.push("settings/BuildSettings.json: the bootstrap resource root must be in alwaysIncluded.");
}

const generatedTables = resourceLayout?.generatedTables;
const tablesRoot = typeof generatedTables === "string" ? resolve(assetsRoot, generatedTables) : resolve(assetsRoot, "__invalid__");
const tableBinaries = allFiles.filter((path) => path.endsWith(".bin") && path.startsWith(`${tablesRoot}${sep}`));
if (tableBinaries.length === 0) {
    failures.push("settings/ResourceLayout.json: no generated Luban binary tables were found at generatedTables.");
}
for (const path of tableBinaries) {
    if (!existsSync(`${path}.meta`)) {
        failures.push(`${relative(projectRoot, path)}: generated binary meta is missing.`);
    }
}

const playerSettings = readJson(join(projectRoot, "settings", "PlayerSettings.json"));
if (playerSettings?.addons?.["laya.ui"] !== "ui2" || playerSettings?.modules?.["laya.ui"] !== true) {
    failures.push("settings/PlayerSettings.json: laya.ui must use ui2.");
}
if (playerSettings?.UI?.alwaysIncludeDefaultSkin !== false) {
    failures.push("settings/PlayerSettings.json: UI.alwaysIncludeDefaultSkin must be false.");
}
for (const setting of ["horizontalScrollBar", "verticalScrollBar", "popupMenu", "tooltipsWidget"]) {
    if (playerSettings?.UI?.[setting] !== null) {
        failures.push(`settings/PlayerSettings.json: UI.${setting} must be null; feature UI declares packaged resources explicitly.`);
    }
}

const startupUI = typeof resourceLayout?.startupUI === "string" ? resourceLayout.startupUI : "__invalid__.lh";
const tipUI = typeof resourceLayout?.tipUI === "string" ? resourceLayout.tipUI : "__invalid__.lh";
const statusAsset = readJson(join(assetsRoot, startupUI));
const tipAsset = readJson(join(assetsRoot, tipUI));
const statusNames = new Set();
visit(statusAsset, (node) => {
    if (typeof node.name === "string") {
        statusNames.add(node.name);
    }
});
for (const requiredName of ["statusText", "detailText"]) {
    if (!statusNames.has(requiredName)) {
        failures.push(`assets/${startupUI}: required child '${requiredName}' is missing.`);
    }
}
if (!statusNames.has("titleText")) {
    failures.push(`assets/${startupUI}: required child 'titleText' is missing.`);
}
const tipNames = new Set();
visit(tipAsset, (node) => {
    if (typeof node.name === "string") {
        tipNames.add(node.name);
    }
});
if (!tipNames.has("messageText")) {
    failures.push(`assets/${tipUI}: required child 'messageText' is missing.`);
}

if (failures.length > 0) {
    console.error("Source asset validation failed:");
    for (const failure of failures) {
        console.error(`- ${failure}`);
    }
    process.exitCode = 1;
} else {
    console.log(`Source assets OK: ${hierarchyFiles.length} hierarchy file(s), ${metaByUuid.size} unique meta uuid(s).`);
    if (useLayaParser) {
        const { runLayaAir } = await import("./layaair.mjs");
        const relativeFiles = hierarchyFiles.map((path) => relative(projectRoot, path));
        const result = runLayaAir(
            ["validate", ...relativeFiles, "-p", projectRoot, "--skip-package-install"],
            { cwd: projectRoot, stdio: "pipe" },
        );
        process.stdout.write(result.stdout);
        const officialResults = JSON.parse(result.stdout);
        const invalidResults = officialResults.filter((item) => item.valid !== true);
        if (invalidResults.length > 0) {
            console.error(`LayaAir CLI rejected ${invalidResults.length} hierarchy asset(s).`);
            process.exitCode = 1;
        }
    }
}
