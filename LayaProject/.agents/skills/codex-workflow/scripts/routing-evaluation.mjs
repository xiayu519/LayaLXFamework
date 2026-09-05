import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { evaluationPolicy } from "./evaluation-policy.mjs";

const WORKFLOW_RULE_PATHS = [
    "AGENTS.md",
    ".agents/skills/sdd-explore/references/alignment-contract.md",
    ".agents/skills/codex-workflow/references/workflow-rules.md",
];

export function loadRoutingEvaluation(projectRoot, environment = process.env) {
    const skillRoot = join(projectRoot, ".agents", "skills", "codex-workflow");
    const definition = JSON.parse(readFileSync(join(skillRoot, "evals", "cases.json"), "utf8"));
    const policy = evaluationPolicy(readFileSync(join(projectRoot, ".codex", "config.toml"), "utf8"), environment);
    const skills = readSkillCatalog(join(projectRoot, ".agents", "skills"));
    const workflowRules = WORKFLOW_RULE_PATHS
        .map((path) => readFileSync(join(projectRoot, path), "utf8"))
        .join("\n");
    return {
        definition,
        policy,
        prompt: buildRoutingPrompt({ ...definition, skills, workflowRules }),
    };
}

export function buildRoutingPrompt({ cases, decisions, skills, workflowRules }) {
    const requests = cases.map(({ id, request }) => ({ id, request }));
    const decisionRequests = decisions.map(({ id, request }) => ({ id, request }));
    return `这是 LXFamework 项目 Skill 的语义路由评测。不要调用工具、打开文件、执行或分析任务本身；只根据下列项目 Skill 名称和 description 分类。
为每个 case 返回完成请求所需的最小项目 Skill 集合。仅在语义确实跨独立边界时返回多个；不要返回系统 Skill、相邻但不需要的 Skill 或解释。保留 case id。
skills: ${JSON.stringify(skills)}
cases: ${JSON.stringify(requests)}
另外根据下面真实规则为 decisions 选择下一步 action，取值为 inspect_only、implement、realign、pause_conflict、stay_in_scope、reuse_evidence、respect_user_model、execute_single_agent、delegate_independent。不要执行任务，不返回解释。
规则：${workflowRules}
decisions: ${JSON.stringify(decisionRequests)}`;
}

export function assertRoutingResult(actual, definition) {
    if (!actual || !Array.isArray(actual.results) || !Array.isArray(actual.decisions)) {
        throw new Error("Routing result must contain results and decisions arrays.");
    }
    const failures = [];
    const expectedSkills = new Map(definition.cases.map((item) => [item.id, [...item.expected].sort()]));
    const observedSkills = new Map();
    for (const result of actual.results) {
        if (observedSkills.has(result.id)) failures.push(`Duplicate routing result id: ${result.id}`);
        observedSkills.set(result.id, Array.isArray(result.skills) ? [...result.skills].sort() : result.skills);
    }
    compareMaps(expectedSkills, observedSkills, failures, "routing");

    const expectedDecisions = new Map(definition.decisions.map((item) => [item.id, item.expected]));
    const observedDecisions = new Map();
    for (const result of actual.decisions) {
        if (observedDecisions.has(result.id)) failures.push(`Duplicate decision id: ${result.id}`);
        observedDecisions.set(result.id, result.action);
    }
    compareMaps(expectedDecisions, observedDecisions, failures, "decision");
    if (failures.length > 0) {
        throw new Error(`Skill routing eval failed:\n- ${failures.join("\n- ")}`);
    }
    return { routing: definition.cases.length, decisions: definition.decisions.length };
}

function compareMaps(expected, observed, failures, kind) {
    for (const [id, value] of expected) {
        if (!observed.has(id)) {
            failures.push(`${id}: missing ${kind} result`);
        } else if (JSON.stringify(observed.get(id)) !== JSON.stringify(value)) {
            failures.push(`${id}: expected ${JSON.stringify(value)}, got ${JSON.stringify(observed.get(id))}`);
        }
        observed.delete(id);
    }
    for (const id of observed.keys()) failures.push(`${id}: unexpected ${kind} result`);
}

function readSkillCatalog(skillsRoot) {
    const catalog = [];
    for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const source = readFileSync(join(skillsRoot, entry.name, "SKILL.md"), "utf8");
        const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1] ?? "";
        const name = /^name:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim();
        const description = /^description:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim();
        if (!name || !description) throw new Error(`Invalid Skill metadata: ${entry.name}/SKILL.md`);
        catalog.push({ name, description });
    }
    return catalog.sort((left, right) => left.name.localeCompare(right.name));
}
