import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const path = join(projectRoot, "settings", "PerformanceBudgets.json");
const failures = [];
let document;
try {
    document = JSON.parse(readFileSync(path, "utf8"));
} catch (error) {
    failures.push(`settings/PerformanceBudgets.json is invalid: ${error.message}`);
}

if (document?.version !== 1) {
    failures.push("Performance budget version must be 1.");
}
const profiles = document?.profiles;
if (!profiles || typeof profiles !== "object" || Array.isArray(profiles)) {
    failures.push("Performance budgets require a profiles object.");
}
const defaultProfile = profiles?.[document?.defaultProfile];
if (defaultProfile?.platform !== "minigame") {
    failures.push("The shared default profile must be a mini-game baseline.");
}
const headlessProfile = profiles?.[document?.headless?.profile];
const headlessBudget = headlessProfile?.scenes?.[document?.headless?.scene];
validateBudget(headlessBudget, "headless profile scene");

const appProfiles = Object.entries(profiles ?? {}).filter(([, profile]) => profile?.platform === "app");
if (appProfiles.length === 0) {
    failures.push("At least one App performance profile is required.");
}
for (const [id, profile] of appProfiles) {
    if (profile.inherits !== document.defaultProfile) {
        failures.push(`App profile '${id}' must inherit the mini-game baseline.`);
    }
    const evidence = new Set(profile.requiredDeviceEvidence ?? []);
    for (const required of ["frame-time", "gpu-memory", "fill-rate", "thermal-stability", "foreground-resume"]) {
        if (!evidence.has(required)) {
            failures.push(`App profile '${id}' is missing device evidence '${required}'.`);
        }
    }
}

for (const [id, profile] of Object.entries(profiles ?? {})) {
    if (!new Set(["minigame", "app"]).has(profile?.platform)) {
        failures.push(`Profile '${id}' has an unsupported platform.`);
    }
    const evidence = profile?.requiredDeviceEvidence;
    if (!Array.isArray(evidence) || evidence.length === 0 || new Set(evidence).size !== evidence.length) {
        failures.push(`Profile '${id}' requires unique device evidence entries.`);
    }
    for (const [scene, budget] of Object.entries(profile?.scenes ?? {})) {
        validateBudget(budget, `profile '${id}' scene '${scene}'`);
    }
}

if (failures.length > 0) {
    console.error("Performance budget validation failed:");
    for (const failure of failures) {
        console.error(`- ${failure}`);
    }
    process.exitCode = 1;
} else {
    console.log(
        `Performance budgets OK: '${document.defaultProfile}' is the shared baseline; `
        + `${appProfiles.length} App profile(s) retain target-device evidence.`,
    );
}

function validateBudget(budget, label) {
    if (!budget || typeof budget !== "object" || Array.isArray(budget)) {
        failures.push(`${label} requires a render budget.`);
        return;
    }
    for (const field of ["drawCalls2D", "drawCalls", "triangles"]) {
        if (!Number.isInteger(budget[field]) || budget[field] < 1) {
            failures.push(`${label}.${field} must be a positive integer.`);
        }
    }
}
