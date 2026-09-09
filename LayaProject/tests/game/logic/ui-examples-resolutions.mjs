import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Reuse a successful current-input build. Each process keeps startup, errors and owner shutdown checks.
const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const viewports = ["320x568", "360x640", "375x667", "390x844", "412x915", "600x800", "768x1024", "1280x720"];
const pending = [...viewports];
const failures = [];
await Promise.all(Array.from({ length: 3 }, async () => {
    while (pending.length) {
        const viewport = pending.shift();
        try {
            await run(viewport);
        } catch (error) {
            failures.push(error);
        }
    }
}));
if (failures.length) throw new AggregateError(failures, "UI resolution verification failed.");
console.log(`UI resolutions OK: ${viewports.join(", ")}; plain, notch/capsule, side insets and restoration at every size.`);

function run(viewport) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [
            "tools/test-browser.mjs", "--suite", "targeted",
            "--probe", "tests/game/logic/ui-examples.browser.mjs", "--viewport", viewport,
        ], { cwd: projectRoot, env: process.env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
        let output = "";
        child.stdout.on("data", (data) => { output += data; });
        child.stderr.on("data", (data) => { output += data; });
        child.on("error", reject);
        child.on("close", (code) => {
            if (code !== 0) reject(new Error(`${viewport}: ${output}`));
            else if (!output.includes(`"viewport":"${viewport}"`) || !output.includes("Browser OK:")) {
                reject(new Error(`${viewport}: missing viewport or completion evidence: ${output}`));
            } else {
                console.log(output.trim());
                resolve();
            }
        });
    });
}
