import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

    it("separates fast, workflow, table and release validation", () => {
        const fastWorkflow = readFileSync("../.github/workflows/static-validation.yml", "utf8");
        const workflowWorkflow = readFileSync("../.github/workflows/workflow-validation.yml", "utf8");
        const tableWorkflow = readFileSync("../.github/workflows/table-validation.yml", "utf8");
        const releaseWorkflow = readFileSync("../.github/workflows/release-validation.yml", "utf8");
        const verifier = readFileSync("tools/verify.mjs", "utf8");
        const pkg = JSON.parse(readFileSync("package.json", "utf8"));

        expect(pkg.scripts.verify).toBe("node tools/verify.mjs --profile fast");
        expect(pkg.scripts["check:project"]).toBe("node tools/doctor.mjs --project-only");
        expect(pkg.scripts["verify:release"]).toBe("node tools/verify.mjs --profile release");
        expect(pkg.scripts["validate:assets"]).toBe("node tools/validate-assets.mjs");
        expect(pkg.scripts["validate:assets:laya"]).toBe("node tools/validate-assets.mjs --laya");
        expect(pkg.scripts["test:unit"]).toContain("tests/framework tests/game");
        expect(pkg.scripts["test:workflow"]).toBe("vitest run tests/workflow");
        expect(verifier).toContain("runLimited(profile.checks, 3)");
        const fastChecks = verifier.split("const fastChecks = [")[1]?.split("];", 1)[0] ?? "";
        for (const releaseOnlyCheck of [
            "doctor", "tables:check", "check:engine-source", "test:headless",
            "check:skills", "check:memory", "validate:game-workflow", "validate:assets:laya",
        ]) {
            expect(fastChecks).not.toContain(releaseOnlyCheck);
        }
        const releaseChecks = verifier.split("const releaseChecks = [")[1]?.split("];", 1)[0] ?? "";
        expect(releaseChecks).toContain('"validate:assets:laya"');

        expect(fastWorkflow).toContain("name: Fast validation");
        expect(fastWorkflow).toContain("npm run verify");
        expect(fastWorkflow).not.toContain("verify:release");
        expect(fastWorkflow).not.toContain("LayaAir CLI");
        expect(fastWorkflow).not.toContain("setup-dotnet");
        expect(fastWorkflow).not.toContain("setup-python");

        expect(workflowWorkflow).toContain("name: Workflow validation");
        expect(workflowWorkflow).toContain("npm run check:skills");
        expect(workflowWorkflow).toContain("npm run check:memory");
        expect(workflowWorkflow).toContain("npm run test:workflow");
        expect(workflowWorkflow).not.toContain("test:skill-routing");
        expect(workflowWorkflow).not.toContain("CODEX_API_KEY");
        expect(workflowWorkflow).not.toContain("LayaAir CLI");

        expect(tableWorkflow).toContain("name: Tables validation");
        expect(tableWorkflow).toContain("npm run tables:check");
        expect(tableWorkflow).not.toContain("npm run verify");
        expect(tableWorkflow).not.toContain("LayaAir CLI");

        expect(releaseWorkflow).toContain("name: Release validation");
        expect(releaseWorkflow).toContain("workflow_dispatch:");
        expect(releaseWorkflow).toContain("tags:");
        expect(releaseWorkflow).not.toContain("pull_request:");
        expect(releaseWorkflow).toContain("os: [windows-latest, macos-latest]");
        expect(releaseWorkflow).toContain("steps.layaair-cache.outputs.cache-hit != 'true'");
        expect(releaseWorkflow).toContain("npm run verify:release");
    });

    it("checks project structure without requiring external toolchains", () => {
        const env = Object.fromEntries(
            Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "path"),
        );
        const output = execFileSync(process.execPath, ["tools/doctor.mjs", "--project-only"], {
            encoding: "utf8",
            env: {
                ...env,
                PATH: "",
                LAYAAIR_INSTALL_DIR: "__missing_layaair__",
                PYTHON_PATH: "__missing_python__",
            },
        });
        expect(output).toContain("Project configuration OK");
    });

    it("runs the complete fast profile without a LayaAir installation", () => {
        const npmCli = process.env.npm_execpath;
        if (!npmCli) {
            throw new Error("npm_execpath is missing; run this test through npm run test:workflow.");
        }
        const output = execFileSync(process.execPath, [npmCli, "run", "verify"], {
            cwd: resolve("."),
            encoding: "utf8",
            env: {
                ...process.env,
                LAYAAIR_INSTALL_DIR: resolve("__missing_layaair__"),
                PYTHON_PATH: resolve("__missing_python__"),
            },
            timeout: 60_000,
        });
        expect(output).toContain("[verify] fast profile passed.");
        expect(output).not.toContain("LayaAir CLI is not installed");
    }, 70_000);

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
