import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CODEX_CLI_VERSION = "0.153.2";
const INPUT_TOKEN_LIMIT = 25_000;
const OUTPUT_TOKEN_LIMIT = 2_500;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const skillRoot = resolve(scriptDirectory, "..");
const projectRoot = resolve(skillRoot, "..", "..", "..");
const casesPath = join(skillRoot, "evals", "cases.json");
const schemaPath = join(skillRoot, "evals", "routing-output.schema.json");
const cases = JSON.parse(readFileSync(casesPath, "utf8")).cases;
const requests = cases.map(({ id, request }) => ({ id, request }));
const prompt = `这是 LXFamework 项目 Skill 的语义路由评测。不要调用工具、打开文件、执行或分析任务本身；只根据本次启动时提供的项目 Skill 名称和 description 分类。
为每个 case 返回完成请求所需的最小项目 Skill 集合。仅在语义确实跨独立边界时返回多个；不要返回系统 Skill、相邻但不需要的 Skill 或解释。保留 case id。
cases: ${JSON.stringify(requests)}`;
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
        "--model", "gpt-5.6-sol",
        "-c", 'model_reasoning_effort="high"',
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
    });
    if (execution.error) {
        throw execution.error;
    }
    if (execution.status !== 0) {
        const evidence = [execution.stdout, execution.stderr].filter(Boolean).join("\n");
        throw new Error(`Codex routing evaluation exited with code ${execution.status ?? 1}.\n${evidence}`);
    }

    const actual = JSON.parse(readFileSync(resultPath, "utf8"));
    const actualById = new Map();
    for (const result of actual.results) {
        if (actualById.has(result.id)) {
            throw new Error(`Duplicate routing result id: ${result.id}`);
        }
        actualById.set(result.id, [...result.skills].sort());
    }

    const failures = [];
    for (const testCase of cases) {
        const observed = actualById.get(testCase.id);
        const expected = [...testCase.expected].sort();
        if (!observed) {
            failures.push(`${testCase.id}: missing result`);
        } else if (JSON.stringify(observed) !== JSON.stringify(expected)) {
            failures.push(`${testCase.id}: expected [${expected.join(", ")}], got [${observed.join(", ")}]`);
        }
        actualById.delete(testCase.id);
    }
    for (const id of actualById.keys()) {
        failures.push(`${id}: unexpected result`);
    }
    if (failures.length > 0) {
        throw new Error(`Skill routing eval failed:\n- ${failures.join("\n- ")}`);
    }

    const events = execution.stdout.split(/\r?\n/).filter(Boolean);
    let usage;
    for (const line of events) {
        try {
            const event = JSON.parse(line);
            if (event.type === "turn.completed") {
                usage = event.usage;
            }
        } catch {
            // Non-JSON progress lines do not affect the schema-validated result.
        }
    }
    if (!usage) {
        throw new Error("Skill routing eval did not report token usage.");
    }
    const inputTokens = Number(usage.input_tokens ?? 0);
    const outputTokens = Number(usage.output_tokens ?? 0);
    if (inputTokens > INPUT_TOKEN_LIMIT) {
        throw new Error(`Skill routing input token budget exceeded: ${inputTokens} > ${INPUT_TOKEN_LIMIT}.`);
    }
    if (outputTokens > OUTPUT_TOKEN_LIMIT) {
        throw new Error(`Skill routing output token budget exceeded: ${outputTokens} > ${OUTPUT_TOKEN_LIMIT}.`);
    }
    console.log(
        `Skill routing OK: ${cases.length} semantic cases, one ephemeral read-only Codex run. `
        + `Usage: ${JSON.stringify(usage)}.`,
    );
} finally {
    if (dirname(evaluationRoot) === temporaryRoot) {
        rmSync(evaluationRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
}
