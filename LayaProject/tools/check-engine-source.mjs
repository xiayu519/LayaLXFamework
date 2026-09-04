import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LAYA_VERSION, resolveLayaRuntime } from "./layaair.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = join(projectRoot, "settings", "LayaSourceBaseline.json");
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const expectedCommit = "f368b43098fe6bde7b961546114e71907c5f8a98";
const expectedNormalization = "crlf-to-lf-trim-line-end-and-final-newline";
const errors = [];

if (baseline.version !== LAYA_VERSION) {
    errors.push(`Baseline version '${baseline.version}' does not match pinned LayaAir ${LAYA_VERSION}.`);
}
if (baseline.officialCommit !== expectedCommit) {
    errors.push(`Baseline commit '${baseline.officialCommit}' is not the reviewed LayaAir v${LAYA_VERSION} commit.`);
}
if (baseline.normalization !== expectedNormalization) {
    errors.push(`Unsupported source normalization '${baseline.normalization}'.`);
}
if (!Array.isArray(baseline.sources) || baseline.sources.length === 0) {
    errors.push("Engine source baseline must contain at least one source entry.");
}

const { runtimeRoot } = resolveLayaRuntime();
const libsRoot = join(runtimeRoot, "Resources", "engine", "libs");
const maps = new Map();
for (const entry of baseline.sources ?? []) {
    let sourceMap = maps.get(entry.library);
    if (!sourceMap) {
        sourceMap = JSON.parse(readFileSync(join(libsRoot, entry.library), "utf8"));
        maps.set(entry.library, sourceMap);
    }
    const normalizedPath = entry.source.replaceAll("\\", "/");
    const index = sourceMap.sources.findIndex((source) => (
        source.replaceAll("\\", "/").endsWith(`/${normalizedPath}`)
    ));
    if (index < 0 || typeof sourceMap.sourcesContent?.[index] !== "string") {
        errors.push(`${entry.library} does not embed '${entry.source}'.`);
        continue;
    }
    const actualHash = sha256(normalize(sourceMap.sourcesContent[index]));
    if (actualHash !== entry.sha256) {
        errors.push(`${entry.source} SHA256 ${actualHash} does not match ${entry.sha256}.`);
    }
}

if (errors.length > 0) {
    console.error("LayaAir source baseline check failed:");
    for (const error of errors) {
        console.error(`- ${error}`);
    }
    process.exitCode = 1;
} else {
    console.log(
        `LayaAir source OK: ${baseline.sources.length} embedded TypeScript files match `
        + `official v${baseline.version} commit ${baseline.officialCommit}.`,
    );
}

function normalize(source) {
    return `${source.replace(/\r\n?/g, "\n").split("\n")
        .map((line) => line.replace(/[ \t]+$/g, ""))
        .join("\n").trimEnd()}\n`;
}

function sha256(value) {
    return createHash("sha256").update(value).digest("hex");
}
