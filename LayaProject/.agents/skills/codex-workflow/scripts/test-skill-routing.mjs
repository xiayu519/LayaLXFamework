import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertUsage, assertToolFreeTranscript } from "./evaluation-policy.mjs";
import { assertRoutingResult, loadRoutingEvaluation } from "./routing-evaluation.mjs";

const CODEX_CLI_VERSION = "0.153.2";
const INPUT_TOKEN_LIMIT = 25_000;
const OUTPUT_TOKEN_LIMIT = 2_500;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const skillRoot = resolve(scriptDirectory, "..");
const projectRoot = resolve(skillRoot, "..", "..", "..");
const schemaPath = join(skillRoot, "evals", "routing-output.schema.json");
const { definition, policy, prompt } = loadRoutingEvaluation(projectRoot, process.env);
const temporaryRoot = resolve(tmpdir());
const evaluationRoot = mkdtempSync(join(temporaryRoot, "lx-skill-routing-"));
const resultPath = join(evaluationRoot, "last-message.json");

try {
    const npmCli = process.env.npm_execpath;
    if (!npmCli) {
        throw new Error("npm_execpath is missing; run this evaluation through 'npm run test:skill-routing'.");
    }
    const codexArguments = [
        "exec",
        "--ephemeral",
        "--ignore-user-config",
        "--skip-git-repo-check",
        "--sandbox", "read-only",
        "--disable", "plugins",
        "--disable", "apps",
        "--model", policy.model,
        "-c", `model_reasoning_effort="${policy.effort}"`,
        "--json",
        "--output-schema", schemaPath,
        "--output-last-message", resultPath,
        "-",
    ];
    const execution = spawnSync(process.execPath, [
        npmCli,
        "exec",
        "--yes",
        `--package=@openai/codex@${CODEX_CLI_VERSION}`,
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
        timeout: 240_000,
    });
    if (execution.error) {
        throw execution.error;
    }
    if (execution.status !== 0) {
        const evidence = [execution.stdout, execution.stderr].filter(Boolean).join("\n");
        throw new Error(`Codex routing evaluation exited with code ${execution.status ?? 1}.\n${evidence}`);
    }

    const events = execution.stdout.split(/\r?\n/).filter(Boolean).flatMap((line) => {
        try { return [JSON.parse(line)]; } catch { return []; }
    });
    const usage = assertToolFreeTranscript(events);
    assertUsage(usage, INPUT_TOKEN_LIMIT, OUTPUT_TOKEN_LIMIT);
    console.log(`Evaluation usage (post-run threshold): ${JSON.stringify(usage)}; ${policy.model}/${policy.effort}.`);
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
