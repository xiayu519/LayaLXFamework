import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    existsSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync,
    mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(projectRoot, "..");
const designRoot = join(repositoryRoot, "Design");
const toolRoot = join(designRoot, "tools");
const lubanDll = join(toolRoot, "Luban", "Luban.dll");
const configuration = join(toolRoot, "luban.conf");
const pinnedVersion = readFileSync(join(toolRoot, "LUBAN_VERSION"), "utf8").trim();
const gameProject = readGameProject();
const codeDestination = resolveProjectPath(gameProject.luban.codeDestination, "luban.codeDestination");
const dataDestination = resolveProjectPath(gameProject.luban.dataDestination, "luban.dataDestination");
const mode = process.argv[2] ?? "validate";

if (!["generate", "check", "validate"].includes(mode)) {
    throw new Error(`Unknown Luban mode '${mode}'. Use generate, check or validate.`);
}
for (const requiredPath of [lubanDll, configuration]) {
    if (!existsSync(requiredPath)) {
        throw new Error(`Required Luban path is missing: ${relative(repositoryRoot, requiredPath)}`);
    }
}

verifyVersion();
const temporaryRoot = resolve(tmpdir());
const outputRoot = mkdtempSync(join(temporaryRoot, "lx-luban-"));
if (!outputRoot.startsWith(`${temporaryRoot}${sep}`)) {
    throw new Error(`Luban output escaped the temporary directory: ${outputRoot}`);
}

function readGameProject() {
    const path = join(projectRoot, "settings", "GameProject.json");
    const value = JSON.parse(readFileSync(path, "utf8"));
    if (value?.schemaVersion !== 1
        || typeof value?.gameId !== "string"
        || !/^[a-z][a-z0-9-]*$/.test(value.gameId)
        || typeof value?.luban?.runtimeSupport !== "string"
        || typeof value?.luban?.codeDestination !== "string"
        || typeof value?.luban?.dataDestination !== "string") {
        throw new Error("settings/GameProject.json has an invalid game or Luban destination contract.");
    }
    return value;
}

function resolveProjectPath(local, label) {
    const path = resolve(projectRoot, local);
    if (!path.startsWith(`${projectRoot}${sep}`)) {
        throw new Error(`settings/GameProject.json ${label} escaped LayaProject: ${local}`);
    }
    return path;
}

try {
    const generatedCode = join(outputRoot, "code");
    const generatedData = join(outputRoot, "data");
    runLuban(generatedCode, generatedData);
    if (mode === "generate") {
        replaceGeneratedDirectory(generatedCode, codeDestination);
        replaceGeneratedDirectory(generatedData, dataDestination);
        console.log("Luban generate OK: TypeScript tables and binary data were updated.");
    } else if (mode === "check") {
        compareGeneratedDirectory(generatedCode, codeDestination);
        compareGeneratedDirectory(generatedData, dataDestination);
        console.log("Luban check OK: committed schema, data and meta files are current.");
    } else {
        console.log("Luban validate OK: source workbooks generated TypeScript and binary data.");
    }
} finally {
    rmSync(outputRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

function verifyVersion() {
    const result = spawnSync("dotnet", [lubanDll, "--version"], {
        cwd: toolRoot,
        encoding: "utf8",
        windowsHide: true,
    });
    if (result.error) {
        throw result.error;
    }
    const actual = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().replace(/^Luban\s+/, "");
    if (actual !== pinnedVersion) {
        throw new Error(`Luban version mismatch: expected '${pinnedVersion}', found '${actual || "unknown"}'.`);
    }
}

function runLuban(codeOutput, dataOutput) {
    const result = spawnSync("dotnet", [
        lubanDll,
        "-t", "client",
        "-d", "bin",
        "-c", "typescript-bin",
        "--conf", configuration,
        "--validationFailAsError",
        "-x", `outputDataDir=${dataOutput}`,
        "-x", `outputCodeDir=${codeOutput}`,
        "-x", "bin.fileExt=bin",
    ], {
        cwd: toolRoot,
        encoding: "utf8",
        windowsHide: true,
    });
    if (result.stdout) {
        process.stdout.write(result.stdout);
    }
    if (result.stderr) {
        process.stderr.write(result.stderr);
    }
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`Luban exited with code ${result.status ?? 1}.`);
    }
}

function replaceGeneratedDirectory(source, destination) {
    const destinationRoot = resolve(destination);
    if (!destinationRoot.startsWith(`${projectRoot}${sep}`)) {
        throw new Error(`Generated destination escaped the project: ${destinationRoot}`);
    }
    rmSync(destinationRoot, { recursive: true, force: true });
    mkdirSync(destinationRoot, { recursive: true });
    for (const file of listFiles(source)) {
        const local = relative(source, file);
        const target = join(destinationRoot, local);
        mkdirSync(dirname(target), { recursive: true });
        const content = readFileSync(file);
        writeFileSync(target, local.endsWith(".ts") ? normalizeLineEndings(content) : content);
        writeFileSync(`${target}.meta`, metadataFor(target));
    }
}

function compareGeneratedDirectory(source, destination) {
    if (!existsSync(destination)) {
        throw new Error(`Generated destination is missing: ${relative(projectRoot, destination)}`);
    }
    const expected = new Map();
    for (const file of listFiles(source)) {
        const local = relative(source, file);
        const destinationFile = join(destination, local);
        expected.set(local, readFileSync(file));
        expected.set(`${local}.meta`, metadataFor(destinationFile));
    }
    const actual = new Set(listFiles(destination).map((file) => relative(destination, file)));
    const differences = [];
    for (const [local, content] of expected) {
        const actualPath = join(destination, local);
        if (!actual.has(local)) {
            differences.push(`missing ${relative(projectRoot, actualPath)}`);
        } else if (!generatedContentEquals(
            local,
            readFileSync(actualPath),
            Buffer.isBuffer(content) ? content : Buffer.from(content),
        )) {
            differences.push(`changed ${relative(projectRoot, actualPath)}`);
        }
        actual.delete(local);
    }
    for (const local of actual) {
        differences.push(`stale ${relative(projectRoot, join(destination, local))}`);
    }
    if (differences.length > 0) {
        throw new Error(`Luban outputs are stale:\n- ${differences.join("\n- ")}\nRun 'npm run tables:generate'.`);
    }
}

function generatedContentEquals(local, actual, expected) {
    if (!local.endsWith(".meta") && !local.endsWith(".ts")) {
        return actual.equals(expected);
    }
    return normalizeLineEndings(actual).equals(normalizeLineEndings(expected));
}

function normalizeLineEndings(content) {
    return Buffer.from(content.toString("utf8").replace(/\r\n?/g, "\n"), "utf8");
}

function listFiles(root) {
    if (!existsSync(root)) {
        return [];
    }
    const files = [];
    for (const entry of readdirSync(root)) {
        const path = join(root, entry);
        if (statSync(path).isDirectory()) {
            files.push(...listFiles(path));
        } else {
            files.push(path);
        }
    }
    return files.sort();
}

function metadataFor(path) {
    const identity = relative(projectRoot, path).split(sep).join("/");
    const bytes = Buffer.from(createHash("sha256").update(`LXFamework:${identity}`).digest().subarray(0, 16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString("hex");
    const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    return Buffer.from(`${JSON.stringify({ uuid }, undefined, 2)}\n`, "utf8");
}
