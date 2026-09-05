import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const LAYA_VERSION = "3.4.1";

export function resolveLayaInstallRoot() {
    return process.env.LAYAAIR_INSTALL_DIR
        ? resolve(process.env.LAYAAIR_INSTALL_DIR)
        : join(homedir(), ".layaair");
}

export function resolveLayaRuntime() {
    const installRoot = resolveLayaInstallRoot();
    const versionsFile = join(installRoot, "versions.json");
    if (!existsSync(versionsFile)) {
        throw new Error(`LayaAir CLI is not installed: ${versionsFile}`);
    }
    const registry = JSON.parse(readFileSync(versionsFile, "utf8"));
    const entry = registry.versions?.find((item) => item.version === LAYA_VERSION);
    if (!entry) {
        throw new Error(`LayaAir CLI ${LAYA_VERSION} is not installed. No fallback is allowed.`);
    }
    const runtimeRoot = resolve(installRoot, entry.path);
    const cliMain = join(runtimeRoot, "Resources", "cli-main.js");
    if (!existsSync(cliMain)) {
        throw new Error(`LayaAir CLI ${LAYA_VERSION} is incomplete: ${cliMain}`);
    }
    return { installRoot, runtimeRoot, cliMain };
}

export function runLayaAir(args, options = {}) {
    const { cliMain } = resolveLayaRuntime();
    const result = spawnSync(process.execPath, [cliMain, ...args], {
        cwd: options.cwd ?? process.cwd(),
        env: process.env,
        stdio: options.stdio ?? "inherit",
        encoding: options.stdio === "pipe" ? "utf8" : undefined,
    });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        const suffix = result.stderr ? `\n${result.stderr}` : "";
        throw new Error(`LayaAir CLI ${LAYA_VERSION} exited with code ${result.status}.${suffix}`);
    }
    return result;
}

const entryFile = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryFile === resolve(fileURLToPath(import.meta.url))) {
    try {
        runLayaAir(process.argv.slice(2), { cwd: process.cwd() });
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    }
}
