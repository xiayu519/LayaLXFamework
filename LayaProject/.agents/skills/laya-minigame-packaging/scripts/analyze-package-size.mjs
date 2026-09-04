import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptRoot, "..", "..", "..", "..");
const options = parseArguments(process.argv.slice(2));
if (!options["build-root"]) {
    fail("Usage: analyze-package-size.mjs --build-root <directory> [--remote-root <directory>] [--main-limit-bytes <n>] [--subpackage-limit-bytes <n>] [--json]");
}

const buildRoot = resolve(projectRoot, options["build-root"]);
const remoteRoot = options["remote-root"] ? resolve(projectRoot, options["remote-root"]) : buildRoot;
for (const [label, path] of [["build root", buildRoot], ["remote root", remoteRoot]]) {
    if (!existsSync(path) || !statSync(path).isDirectory()) {
        fail(`${label} is missing: ${path}`);
    }
}

const buildSettings = JSON.parse(readFileSync(join(projectRoot, "settings", "BuildSettings.json"), "utf8"));
const subpackages = buildSettings.enableSubpackages === true && Array.isArray(buildSettings.subpackages)
    ? buildSettings.subpackages
    : [];
const packageRoots = [];
const reports = [];
for (const entry of subpackages) {
    const packageRoot = resolve(entry.remote ? remoteRoot : buildRoot, entry.path);
    const expectedRoot = entry.remote ? remoteRoot : buildRoot;
    if (packageRoot !== expectedRoot && !packageRoot.startsWith(`${expectedRoot}${sep}`)) {
        fail(`subpackage escaped its output root: ${entry.path}`);
    }
    if (!existsSync(packageRoot)) {
        fail(`subpackage output is missing: ${entry.path}`);
    }
    if (packageRoot === buildRoot || packageRoot.startsWith(`${buildRoot}${sep}`)) {
        packageRoots.push(packageRoot);
    }
    reports.push({
        name: entry.path,
        kind: entry.remote ? "remote" : "subpackage",
        bytes: totalBytes(packageRoot),
    });
}

const mainBytes = listFiles(buildRoot)
    .filter((path) => !packageRoots.some((root) => path === root || path.startsWith(`${root}${sep}`)))
    .reduce((sum, path) => sum + statSync(path).size, 0);
reports.unshift({ name: "main", kind: "main", bytes: mainBytes });

const mainLimit = parseLimit(options["main-limit-bytes"], "main-limit-bytes");
const subpackageLimit = parseLimit(options["subpackage-limit-bytes"], "subpackage-limit-bytes");
const violations = reports.filter((report) => {
    const limit = report.kind === "main" ? mainLimit : subpackageLimit;
    return limit !== undefined && report.bytes > limit;
}).map((report) => `${report.name} is ${report.bytes} bytes, limit ${report.kind === "main" ? mainLimit : subpackageLimit}`);

if (options.json === true) {
    console.log(JSON.stringify({ buildRoot, reports, violations }, undefined, 2));
} else {
    for (const report of reports) {
        console.log(`${report.kind.padEnd(10)} ${report.name.padEnd(32)} ${formatBytes(report.bytes)} (${report.bytes} bytes)`);
    }
}
if (violations.length > 0) {
    console.error("Package size validation failed:");
    for (const violation of violations) {
        console.error(`- ${violation}`);
    }
    process.exitCode = 1;
}

function parseArguments(args) {
    const result = {};
    const allowed = new Set(["build-root", "remote-root", "main-limit-bytes", "subpackage-limit-bytes", "json"]);
    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index];
        if (!argument.startsWith("--")) {
            fail(`unexpected argument '${argument}'.`);
        }
        const key = argument.slice(2);
        if (!allowed.has(key)) {
            fail(`unknown option --${key}.`);
        }
        if (key === "json") {
            result.json = true;
            continue;
        }
        const value = args[++index];
        if (!value || value.startsWith("--")) {
            fail(`missing value for --${key}.`);
        }
        result[key] = value;
    }
    return result;
}

function parseLimit(value, name) {
    if (value === undefined) {
        return undefined;
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        fail(`--${name} must be a positive integer.`);
    }
    return parsed;
}

function listFiles(root) {
    const files = [];
    for (const entry of readdirSync(root, { withFileTypes: true })) {
        const path = join(root, entry.name);
        if (entry.isDirectory()) {
            files.push(...listFiles(path));
        } else {
            files.push(path);
        }
    }
    return files;
}

function totalBytes(root) {
    return listFiles(root).reduce((sum, path) => sum + statSync(path).size, 0);
}

function formatBytes(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(2)} KiB`;
    }
    return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

function fail(message) {
    console.error(message);
    process.exit(2);
}
