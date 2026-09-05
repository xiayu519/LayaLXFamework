import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertRoutingResult, loadRoutingEvaluation } from "./routing-evaluation.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..", "..", "..", "..");
const serialized = process.env.LX_CODEX_EVAL_RESULT;
if (!serialized) {
    throw new Error("LX_CODEX_EVAL_RESULT is missing; pass the Codex Action final-message output.");
}
const { definition, policy } = loadRoutingEvaluation(projectRoot, process.env);
const counts = assertRoutingResult(JSON.parse(serialized), definition);
console.log(`Skill routing OK: ${counts.routing} routing + ${counts.decisions} decision cases, ${policy.model}/${policy.effort}.`);
