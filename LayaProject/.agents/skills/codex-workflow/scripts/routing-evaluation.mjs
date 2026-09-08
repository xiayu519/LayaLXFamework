import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { evaluationPolicy } from "./evaluation-policy.mjs";

const WORKFLOW_RULE_PATHS = [
    ".agents/skills/sdd-explore/SKILL.md",
    ".agents/skills/sdd-explore/references/alignment-contract.md",
    ".agents/skills/bounded-task/SKILL.md",
];
const VERIFICATION_RULE_PATHS = [
    [".agents/skills/codex-workflow/references/workflow-rules.md", "Verification"],
    [".agents/skills/laya-headless/references/verification.md", "探针范围与构建复用"],
];

export function selectEvaluationCases(definition, args = []) {
    const groups = ["cases", "decisions", "verification"];
    const groupNames = { routing: "cases", decisions: "decisions", verification: "verification" };
    const ids = new Set();
    for (const group of groups) for (const item of definition[group] ?? []) {
        if (ids.has(item.id)) throw new Error(`Duplicate evaluation case id: ${item.id}`);
        ids.add(item.id);
    }
    const selected = new Set();
    const selectors = new Set();
    for (let index = 0; index < args.length; index += 2) {
        const [flag, value] = args.slice(index, index + 2);
        if (!["--case", "--group"].includes(flag) || !value || value.startsWith("--")) {
            throw new Error("Usage: [--case <id>] [--group routing|decisions|verification] (repeatable)");
        }
        const selector = `${flag}:${value}`;
        if (selectors.has(selector)) throw new Error(`Duplicate evaluation selector: ${selector}`);
        selectors.add(selector);
        if (flag === "--case") {
            if (!ids.has(value)) throw new Error(`Unknown evaluation case: ${value}`);
            selected.add(value);
        } else {
            if (!Object.hasOwn(groupNames, value)) throw new Error(`Unknown evaluation group: ${value}`);
            for (const item of definition[groupNames[value]] ?? []) selected.add(item.id);
        }
    }
    const result = Object.fromEntries(groups.map((group) => [group,
        (definition[group] ?? []).filter((item) => !args.length || selected.has(item.id)),
    ]));
    if (!groups.some((group) => result[group].length)) throw new Error("Evaluation selection is empty.");
    return result;
}

export function loadRoutingEvaluation(projectRoot, environment = process.env, args = []) {
    const skillRoot = join(projectRoot, ".agents", "skills", "codex-workflow");
    const definition = selectEvaluationCases({
        ...JSON.parse(readFileSync(join(skillRoot, "evals", "cases.json"), "utf8")),
        verification: JSON.parse(readFileSync(join(skillRoot, "evals", "verification-cases.json"), "utf8")),
    }, args);
    const policy = evaluationPolicy(readFileSync(join(projectRoot, ".codex", "config.toml"), "utf8"), environment);
    const skills = definition.cases.length ? readSkillCatalog(join(projectRoot, ".agents", "skills")) : [];
    const ruleTexts = ["AGENTS.md",
        ...(definition.decisions.length ? WORKFLOW_RULE_PATHS : []),
    ]
        .map((path) => readFileSync(join(projectRoot, path), "utf8"));
    if (definition.verification.length) {
        for (const [path, heading] of VERIFICATION_RULE_PATHS) {
            const section = readFileSync(join(projectRoot, path), "utf8")
                .split(/(?=^## )/m).find((text) => text.split(/\r?\n/, 1)[0] === `## ${heading}`);
            if (!section) throw new Error(`Missing evaluation rule section '${heading}' in ${path}`);
            ruleTexts.push(section);
        }
    }
    const workflowRules = ruleTexts.join("\n");
    return {
        definition,
        policy,
        prompt: buildRoutingPrompt({ ...definition, skills, workflowRules }),
    };
}

export function buildRoutingPrompt({ cases, decisions, verification = [], skills, workflowRules }) {
    const requests = cases.map(({ id, request }) => ({ id, request }));
    const decisionRequests = decisions.map(({ id, request }) => ({ id, request }));
    const verificationRequests = verification.map(({ id, request }) => ({ id, request }));
    return `这是 LXFamework 项目 Skill 的语义路由评测。不要调用工具、打开文件、执行或分析任务本身；只根据下列项目 Skill 名称和 description 分类。
为每个 case 返回完成请求所需的最小项目 Skill 集合。仅在语义确实跨独立边界时返回多个；不要返回系统 Skill、相邻但不需要的 Skill 或解释。保留 case id。
skills: ${JSON.stringify(skills)}
cases: ${JSON.stringify(requests)}
另外根据下面真实规则为 decisions 选择下一步 action，取值为 inspect_only、implement、realign、pause_conflict、stay_in_scope、reuse_evidence、respect_user_model、execute_single_agent、delegate_independent。不要执行任务，不返回解释。
规则：${workflowRules}
decisions: ${JSON.stringify(decisionRequests)}
另外为 verification 选择完成本次变更所需的最小 checks 集合，不返回未触发的检查。可用值：diff_links（差异与相关链接）、typecheck、related_tests（相关测试文件）、architecture、skills、memory、game_template、model_subset（受影响模型案例）、engine_targeted_build（一次当前构建+专项引擎探针）、engine_targeted_reuse（复用本轮未变构建+专项探针）、verify（全项目快速回归）、release（完整发布验收，已包含其内部检查）。不要重复选择被其他检查包含的命令；允许无需重跑时返回空集合。没有案例的组返回空数组。
verification: ${JSON.stringify(verificationRequests)}`;
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
    const expectedVerification = new Map((definition.verification ?? []).map((item) => [item.id, [...item.expected].sort()]));
    const observedVerification = new Map();
    if (!Array.isArray(actual.verification)) failures.push("Missing verification results array.");
    for (const result of actual.verification ?? []) {
        if (observedVerification.has(result.id)) failures.push(`Duplicate verification id: ${result.id}`);
        observedVerification.set(result.id, Array.isArray(result.checks) ? [...result.checks].sort() : result.checks);
    }
    compareMaps(expectedVerification, observedVerification, failures, "verification");
    if (failures.length > 0) {
        throw new Error(`Skill routing eval failed:\n- ${failures.join("\n- ")}`);
    }
    return { routing: definition.cases.length, decisions: definition.decisions.length,
        verification: (definition.verification ?? []).length };
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
