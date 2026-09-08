import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertUsage, assertToolFreeTranscript, evaluationArguments, validateEvaluationSettings } from "./evaluation-policy.mjs";
import { assertRoutingResult, loadRoutingEvaluation } from "./routing-evaluation.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const skillRoot = resolve(scriptDirectory, "..");
const projectRoot = resolve(skillRoot, "..", "..", "..");
const environmentGuide = "../Books/LXFamework-Environment.md";
const schemaPath = join(skillRoot, "evals", "routing-output.schema.json");
const settings = validateEvaluationSettings(JSON.parse(readFileSync(join(skillRoot, "evals", "policy.json"), "utf8")));
const { definition, policy, prompt } = loadRoutingEvaluation(projectRoot, process.env);
const temporaryRoot = resolve(tmpdir());
const evaluationRoot = mkdtempSync(join(temporaryRoot, "lx-skill-routing-"));
const resultPath = join(evaluationRoot, "last-message.json");

try {
    const npmCli = process.env.npm_execpath;
    if (!npmCli) {
        throw new Error("npm_execpath is missing; run this evaluation through 'npm run test:skill-routing'.");
    }
    const codexArguments = evaluationArguments(policy, schemaPath, resultPath);
    const started = performance.now();
    const execution = spawnSync(process.execPath, [
        npmCli,
        "exec",
        "--yes",
        `--package=@openai/codex@${settings.codexCliVersion}`,
        "--",
        "codex",
        ...codexArguments,
    ], {
        cwd: projectRoot,
        env: process.env,
        input: prompt,
        encoding: "utf8",
        windowsHide: true,
        maxBuffer: 20 * 1024 * 1024,
        timeout: settings.routing.timeoutMs,
    });
    if (execution.error) {
        throw new Error(`Local Codex CLI could not run. See ${environmentGuide}. (${execution.error.message})`);
    }
    if (execution.status !== 0) {
        const evidence = [execution.stdout, execution.stderr].filter(Boolean).join("\n");
        throw new Error(
            `Codex routing evaluation exited with code ${execution.status ?? 1}. `
            + `Use the locally authenticated Codex CLI; CODEX_API_KEY is not required. See ${environmentGuide}.\n${evidence}`,
        );
    }

    const events = execution.stdout.split(/\r?\n/).filter(Boolean).flatMap((line) => {
        try { return [JSON.parse(line)]; } catch { return []; }
    });
    const usage = assertToolFreeTranscript(events);
    console.log(`Evaluation: ${JSON.stringify({ ...policy, cli: settings.codexCliVersion,
        elapsedMs: Math.round(performance.now() - started), usage })}`);
    assertUsage(usage, settings.routing.inputTokens, settings.routing.outputTokens);
    const actual = JSON.parse(readFileSync(resultPath, "utf8"));
    const counts = assertRoutingResult(actual, definition);

    console.log(
        `Skill routing OK: ${counts.routing} routing + ${counts.decisions} decision cases, ${policy.model}/${policy.effort}, one ephemeral read-only Codex run. `
        + `Usage: ${JSON.stringify(usage)}.`,
    );
} finally {
    if (dirname(evaluationRoot) === temporaryRoot) {
        rmSync(evaluationRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
}
