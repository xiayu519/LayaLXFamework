import { spawn } from "node:child_process";

const staticChecks = [
    "tables:check",
    "typecheck",
    "test",
    "check:architecture",
    "check:engine-source",
    "validate:assets",
    "validate:content-assets",
    "validate:resource-layout",
    "validate:performance",
    "validate:game-workflow",
    "check:skills",
    "check:memory",
];
const npmCli = process.env.npm_execpath;
if (!npmCli) {
    throw new Error("npm_execpath is missing; run verification through 'npm run verify'.");
}

function run(check) {
    console.log(`[verify] start npm run ${check}`);
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [npmCli, "run", check], {
            cwd: process.cwd(),
            env: process.env,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        let settled = false;
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
            stdout += chunk;
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk;
        });
        child.on("error", (error) => {
            if (!settled) {
                settled = true;
                resolve({ check, status: 1, stdout, stderr, error });
            }
        });
        child.on("close", (status) => {
            if (!settled) {
                settled = true;
                resolve({ check, status: status ?? 1, stdout, stderr });
            }
        });
    });
}

function report(result) {
    console.log(`\n[verify] npm run ${result.check}`);
    if (result.stdout) {
        process.stdout.write(result.stdout);
    }
    if (result.stderr) {
        process.stderr.write(result.stderr);
    }
    if (result.error) {
        console.error(result.error);
    }
    console.log(`[verify] ${result.check}: ${result.status === 0 ? "passed" : "failed"}`);
}

const doctor = await run("doctor");
report(doctor);
if (doctor.status !== 0) {
    process.exit(doctor.status);
}

const staticResults = await Promise.all(staticChecks.map(run));
for (const result of staticResults) {
    report(result);
}
const staticFailure = staticResults.find((result) => result.status !== 0);
if (staticFailure) {
    console.error("[verify] Headless release check skipped because a static check failed.");
    process.exit(staticFailure.status);
}

const headless = await run("test:headless");
report(headless);
if (headless.status !== 0) {
    process.exit(headless.status);
}

console.log("\n[verify] all checks passed.");
