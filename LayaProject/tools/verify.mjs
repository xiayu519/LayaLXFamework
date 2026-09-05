import { spawn } from "node:child_process";

const fastChecks = [
    "check:project",
    "check:framework-integrity",
    "typecheck",
    "test:unit",
    "check:architecture",
    "validate:assets",
    "validate:content-assets",
    "validate:resource-layout",
    "validate:performance",
];
const releaseChecks = [
    "check:framework-integrity",
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
const profiles = {
    fast: { checks: fastChecks, doctor: false, headless: false },
    release: { checks: releaseChecks, doctor: true, headless: true },
};
const profileName = readProfile(process.argv.slice(2));
const profile = profiles[profileName];
const npmCli = process.env.npm_execpath;
if (!npmCli) {
    throw new Error("npm_execpath is missing; run verification through an npm script.");
}

console.log(`[verify] profile=${profileName}; max-concurrency=3`);

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

if (profile.doctor) {
    const doctor = await run("doctor");
    report(doctor);
    if (doctor.status !== 0) {
        process.exit(doctor.status);
    }
}

const results = await runLimited(profile.checks, 3);
for (const result of results) {
    report(result);
}
const failure = results.find((result) => result.status !== 0);
if (failure) {
    if (profile.headless) {
        console.error("[verify] Headless release check skipped because a prerequisite failed.");
    }
    process.exit(failure.status);
}

if (profile.headless) {
    const headless = await run("test:headless");
    report(headless);
    if (headless.status !== 0) {
        process.exit(headless.status);
    }
}

console.log(`\n[verify] ${profileName} profile passed.`);

async function runLimited(checks, limit) {
    const results = new Array(checks.length);
    let next = 0;
    async function worker() {
        while (next < checks.length) {
            const index = next;
            next += 1;
            results[index] = await run(checks[index]);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, checks.length) }, worker));
    return results;
}

function readProfile(args) {
    if (args.length !== 2 || args[0] !== "--profile" || !(args[1] in profiles)) {
        throw new Error("Usage: node tools/verify.mjs --profile <fast|release>");
    }
    return args[1];
}
