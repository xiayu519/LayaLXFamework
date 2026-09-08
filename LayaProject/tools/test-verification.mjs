import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// Opt-in integration check: ordinary unit/workflow tests must not recursively run verify.
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run through npm run test:verification.");
const result = spawnSync(process.execPath, [npmCli, "run", "verify"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
        ...process.env,
        LAYAAIR_INSTALL_DIR: resolve("__missing_layaair__"),
        PYTHON_PATH: resolve("__missing_python__"),
    },
    windowsHide: true,
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
});
if (result.error || result.status !== 0) {
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw result.error ?? new Error(`Fast profile failed: ${result.status}.`);
}
assert.match(result.stdout, /\[verify\] fast profile passed\./);
assert.doesNotMatch(result.stdout, /start npm run (doctor|test:headless|test:skill-routing|tables:)/);
console.log("Verification integration OK: complete fast profile passed without LayaAir/Python; no nested workflow validation.");
