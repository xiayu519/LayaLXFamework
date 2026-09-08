import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Opt-in integration test: reuse a successful current-input build, never nest in Vitest.
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cases = [
    { name: "network", args: ["--suite", "network"], completed: "network", forbidden: ["runFrameworkProbes:"] },
    { name: "framework", args: ["--suite", "framework"], completed: "framework", forbidden: ["runNetworkProbes:"] },
    { name: "all", args: [], completed: "lifecycle,network,framework", forbidden: [] },
    { name: "reject", args: ["--suite", "targeted", "--probe", "tests/workflow/fixtures/browser-reject.mjs"], failure: /Extra browser probe failed:.*intentional probe rejection/ },
    { name: "console-error", args: ["--suite", "targeted", "--probe", "tests/workflow/fixtures/browser-console-error.mjs"], failure: /browser errors: intentional browser error/ },
];

for (const item of cases) {
    const started = performance.now();
    const result = spawnSync(process.execPath, ["tools/test-browser.mjs", ...item.args], {
        cwd: projectRoot, env: process.env, encoding: "utf8", windowsHide: true,
        timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    const evidence = `${result.stdout}\n${result.stderr}`;
    if (item.failure) {
        assert.notEqual(result.status, 0, `${item.name} must fail`);
        assert.match(evidence, item.failure);
        assert.ok(!result.stdout.includes("Browser OK:"), evidence);
    } else {
        assert.equal(result.status, 0, evidence);
        assert.ok(result.stdout.includes(`suite=${item.name}, probes=${item.completed} passed, clean scene shutdown, no errors.`), evidence);
        for (const marker of item.forbidden) assert.ok(!result.stdout.includes(marker), evidence);
    }
    console.log(`Browser suite integration OK: ${item.name}, ${Math.round(performance.now() - started)}ms`);
}
