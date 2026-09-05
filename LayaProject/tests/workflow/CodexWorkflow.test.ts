import { readFileSync } from "node:fs";
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

    it("keeps semantic evaluation in the authenticated local Codex CLI", () => {
        const workflow = readFileSync("../.github/workflows/codex-workflow.yml", "utf8");
        expect(workflow).not.toContain("openai/codex-action");
        expect(workflow).not.toContain("CODEX_API_KEY");
        expect(workflow).not.toContain("secrets.");
        expect(workflow).not.toContain("actions/upload-artifact");
        expect(workflow).not.toContain("actions/download-artifact");
        expect(workflow).not.toContain("semantic-evaluation");
        expect(workflow).not.toContain("npm run test:skill-routing");
        expect(workflow).toContain("npm run check:skills");
        expect(workflow).toContain("npm test -- tests/workflow");

        const pkg = JSON.parse(readFileSync("package.json", "utf8"));
        expect(pkg.scripts["test:skill-routing"])
            .toBe("node .agents/skills/codex-workflow/scripts/test-skill-routing.mjs");
        expect(pkg.scripts).not.toHaveProperty("prepare:skill-routing");
        expect(pkg.scripts).not.toHaveProperty("validate:skill-routing");

        const localRunner = readFileSync(
            ".agents/skills/codex-workflow/scripts/test-skill-routing.mjs",
            "utf8",
        );
        expect(localRunner).toContain("@openai/codex@${CODEX_CLI_VERSION}");
        expect(localRunner).toContain('"--ephemeral"');
        expect(localRunner).toContain('"--sandbox", "read-only"');
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
