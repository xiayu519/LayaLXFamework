import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runLayaAir } from "./layaair.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (resolve(process.cwd()) !== projectRoot) {
    throw new Error(`Headless verification must run in-place from '${projectRoot}'.`);
}

console.log("[headless] building the current project with LayaAir 3.4.1 CLI");
runLayaAir(
    ["build", "web", "-p", projectRoot, "--skip-package-install"],
    { cwd: projectRoot },
);

runNodeCheck("2D release", "validate-build.mjs");
runNodeCheck("headless Chromium runtime", "test-browser.mjs");
console.log("[headless] in-place 2D build and runtime verification passed; no project copy was created.");

function runNodeCheck(label, filename) {
    console.log(`[headless] checking ${label}`);
    const result = spawnSync(process.execPath, [join(projectRoot, "tools", filename)], {
        cwd: projectRoot,
        env: process.env,
        stdio: "inherit",
    });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`Headless check '${label}' exited with code ${result.status ?? 1}.`);
    }
}
