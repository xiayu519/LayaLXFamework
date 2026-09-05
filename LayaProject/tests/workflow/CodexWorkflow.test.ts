import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
    assertRoutingResult,
    buildRoutingPrompt,
} from "../../.agents/skills/codex-workflow/scripts/routing-evaluation.mjs";

describe("Codex workflow policy", () => {
    it("keeps single-maintainer usage distinct from Codex delegation", () => {
        const agents = readFileSync("AGENTS.md", "utf8");
        const bounded = readFileSync(".agents/skills/bounded-task/SKILL.md", "utf8");
        const rules = readFileSync(".agents/skills/codex-workflow/references/workflow-rules.md", "utf8");
        expect(agents).toContain("框架由一人维护，使用时约 2–3 人协作");
        expect(agents).toContain("Codex 默认单代理");
        expect(agents).toContain("仅跨独立风险边界或用户明确要求时委派");
        expect(bounded).toContain("默认由当前代理直接完成");
        expect(rules).toContain("使用团队规模不等于 Codex 代理数量");
    });

    it("uses Codex Action without exposing the key to repository commands", () => {
        const workflow = readFileSync("../.github/workflows/codex-workflow.yml", "utf8");
        expect(workflow).toContain("uses: openai/codex-action@v1");
        expect(workflow).toContain("openai-api-key: ${{ secrets.CODEX_API_KEY }}");
        expect(workflow).not.toMatch(/env:\s*\r?\n\s+(?:CODEX|OPENAI)_API_KEY:/);
        expect(workflow).not.toContain("npm run test:skill-routing");
        expect(workflow.split(/\r?\n/).filter((line) => line.includes("secrets.CODEX_API_KEY")))
            .toEqual([
                "          openai-api-key: ${{ secrets.CODEX_API_KEY }}",
            ]);

        const semanticJob = workflow.split("  semantic-evaluation:")[1]?.split("\n  validate-semantic-result:")[0] ?? "";
        const actionIndex = semanticJob.indexOf("uses: openai/codex-action@v1");
        expect(actionIndex).toBeGreaterThan(0);
        expect(semanticJob).toContain("uses: actions/download-artifact@v4");
        expect(semanticJob).not.toContain("actions/checkout");
        expect(semanticJob).not.toContain("actions/setup-node");
        expect(semanticJob).not.toMatch(/\n\s+run:/);
        expect(semanticJob).not.toContain("npm ");
        expect(semanticJob).toContain("codex-version: 0.153.2");
        expect(semanticJob).toContain('"--skip-git-repo-check"');
        expect(semanticJob.slice(actionIndex)).not.toMatch(/\n\s{6}- (?:name:|run:|uses:)/);

        const staticJob = workflow.split("  static-policy:")[1]?.split("\n  semantic-evaluation:")[0] ?? "";
        expect(staticJob).toContain("uses: actions/upload-artifact@v4");
        expect(staticJob).toContain("LayaProject/codex-eval/routing-prompt.md");
        expect(staticJob).toContain("LayaProject/codex-eval/routing-output.schema.json");
    });

    it("triggers on game workflow, package, validator, executor and deterministic tests", () => {
        const workflow = readFileSync("../.github/workflows/codex-workflow.yml", "utf8");
        expect(workflow).toMatch(/push:\s*\r?\n\s+branches:\s*\r?\n\s+- main\s*\r?\n\s+paths:/);
        for (const path of [
            "LayaProject/src/game/**/AGENTS.md",
            "LayaProject/src/game/**/.agents/**",
            "LayaProject/package.json",
            "LayaProject/package-lock.json",
            "LayaProject/tools/validate-skills.py",
            "LayaProject/tools/run-python.mjs",
            "LayaProject/tests/workflow/**",
        ]) {
            expect(workflow).toContain(`- '${path}'`);
        }
    });

    it("prepares only the sanitized prompt, schema and scalar policy outputs", () => {
        const temporaryRoot = resolve(tmpdir());
        const fixture = mkdtempSync(join(temporaryRoot, "lx-codex-artifact-"));
        try {
            const prompt = join(fixture, "routing-prompt.md");
            const schema = join(fixture, "routing-output.schema.json");
            const githubOutput = join(fixture, "github-output.txt");
            execFileSync(process.execPath, [
                resolve(".agents/skills/codex-workflow/scripts/prepare-skill-routing.mjs"),
                "--prompt", prompt,
                "--schema", schema,
                "--github-output", githubOutput,
            ]);
            expect(readFileSync(prompt, "utf8")).not.toContain('"expected"');
            expect(JSON.parse(readFileSync(schema, "utf8"))).toHaveProperty("properties.results");
            expect(readFileSync(githubOutput, "utf8")).toMatch(/^model=[a-zA-Z0-9._-]+\neffort=(?:low|medium|high|xhigh|max|ultra)\n$/);
        } finally {
            const local = relative(temporaryRoot, resolve(fixture));
            if (!local || local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)) {
                throw new Error(`Refusing unsafe fixture cleanup: ${fixture}`);
            }
            rmSync(fixture, { recursive: true, force: true });
        }
    });
});

describe("structured routing evaluation", () => {
    const definition = {
        cases: [{ id: "route", request: "request", expected: ["b", "a"] }],
        decisions: [{ id: "decision", request: "request", expected: "execute_single_agent" }],
    };

    it("does not put expected answers into the generated prompt", () => {
        const prompt = buildRoutingPrompt({
            ...definition,
            skills: [{ name: "a", description: "A description" }],
            workflowRules: "rules",
        });
        expect(prompt).toContain('"id":"route","request":"request"');
        expect(prompt).not.toContain('"expected"');
    });

    it("accepts exact unordered skills and rejects missing, duplicate or unexpected results", () => {
        const valid = {
            results: [{ id: "route", skills: ["a", "b"] }],
            decisions: [{ id: "decision", action: "execute_single_agent" }],
        };
        expect(assertRoutingResult(valid, definition)).toEqual({ routing: 1, decisions: 1 });
        expect(() => assertRoutingResult({ ...valid, results: [] }, definition)).toThrow(/missing routing/);
        expect(() => assertRoutingResult({ ...valid, decisions: [...valid.decisions, ...valid.decisions] }, definition))
            .toThrow(/Duplicate decision/);
        expect(() => assertRoutingResult({ ...valid, results: [...valid.results, { id: "extra", skills: [] }] }, definition))
            .toThrow(/unexpected routing/);
    });
});
