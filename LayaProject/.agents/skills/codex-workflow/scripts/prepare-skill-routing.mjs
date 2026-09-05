import { appendFileSync, copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRoutingEvaluation } from "./routing-evaluation.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..", "..", "..", "..");
const options = parseOptions(process.argv.slice(2));
const promptPath = resolve(projectRoot, options.prompt);
const schemaPath = resolve(projectRoot, options.schema);
const { definition, policy, prompt } = loadRoutingEvaluation(projectRoot, process.env);

mkdirSync(dirname(promptPath), { recursive: true });
writeFileSync(promptPath, `${prompt}\n`, "utf8");
mkdirSync(dirname(schemaPath), { recursive: true });
copyFileSync(
    resolve(projectRoot, ".agents/skills/codex-workflow/evals/routing-output.schema.json"),
    schemaPath,
);
if (options.githubOutput) {
    appendFileSync(resolve(options.githubOutput), `model=${policy.model}\neffort=${policy.effort}\n`, "utf8");
}
console.log(
    `Prepared ${definition.cases.length} routing + ${definition.decisions.length} decision cases for ${policy.model}/${policy.effort}.`,
);

function parseOptions(args) {
    const result = {
        prompt: "codex-eval/routing-prompt.md",
        schema: "codex-eval/routing-output.schema.json",
        githubOutput: undefined,
    };
    for (let index = 0; index < args.length; index += 2) {
        const name = args[index];
        const value = args[index + 1];
        if (!value || !["--prompt", "--schema", "--github-output"].includes(name)) {
            throw new Error(
                "Usage: prepare-skill-routing.mjs [--prompt <path>] [--schema <path>] [--github-output <path>]",
            );
        }
        if (name === "--prompt") result.prompt = value;
        if (name === "--schema") result.schema = value;
        if (name === "--github-output") result.githubOutput = value;
    }
    return result;
}
