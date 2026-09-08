import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    assertRoutingResult,
    buildRoutingPrompt,
    loadRoutingEvaluation,
    selectEvaluationCases,
} from "../../.agents/skills/codex-workflow/scripts/routing-evaluation.mjs";
import { evaluationArguments, evaluationPolicy } from "../../.agents/skills/codex-workflow/scripts/evaluation-policy.mjs";

describe("Codex workflow policy", () => {
    it("loads the current config and complete cases without exposing answer fields", () => {
        const evaluation = loadRoutingEvaluation(resolve("."), {});
        expect(evaluation.policy).toEqual(evaluationPolicy(readFileSync(".codex/config.toml", "utf8")));
        for (const group of [evaluation.definition.cases, evaluation.definition.decisions, evaluation.definition.verification ?? []]) {
            expect(new Set(group.map((item) => item.id)).size).toBe(group.length);
            for (const item of group) expect(evaluation.prompt).toContain(JSON.stringify({ id: item.id, request: item.request }));
        }
        expect(evaluation.prompt).not.toContain('"expected"');
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
        expect(localRunner).toContain("@openai/codex@${settings.codexCliVersion}");
        const args = evaluationArguments({ model: "selected-model", effort: "medium" }, "schema", "output");
        expect(args).toContain("--ephemeral");
        expect(args).toContain("--ignore-user-config");
        expect(args.slice(args.indexOf("--sandbox"), args.indexOf("--sandbox") + 2)).toEqual(["--sandbox", "read-only"]);
        expect(localRunner).toContain("CODEX_API_KEY is not required");
        expect(localRunner).toContain("../Books/LXFamework-Environment.md");
    });

    it("keeps GitHub limited to the framework sync contract", () => {
        const workflowNames = readdirSync("../.github/workflows").sort();
        const syncWorkflow = readFileSync("../.github/workflows/framework-sync.yml", "utf8");
        const verifier = readFileSync("tools/verify.mjs", "utf8");
        const pkg = JSON.parse(readFileSync("package.json", "utf8"));

        expect(workflowNames).toEqual(["framework-sync.yml"]);
        expect(syncWorkflow).toContain("name: Framework sync contract");
        expect(syncWorkflow).toContain("npm run check:framework-upstream");
        expect(syncWorkflow).toContain("npm run check:framework-integrity");
        expect(syncWorkflow).toContain("npm run test:framework-sync");
        for (const forbidden of [
            "setup-python", "setup-dotnet", "LayaAir", "CODEX_API_KEY", "test:skill-routing",
            "npm run verify", "npm run tables:", "npm run check:skills", "npm run test:headless",
        ]) {
            expect(syncWorkflow).not.toContain(forbidden);
        }

        expect(pkg.scripts.verify).toBe("node tools/verify.mjs --profile fast");
        expect(pkg.scripts["check:project"]).toBe("node tools/doctor.mjs --project-only");
        expect(pkg.scripts["verify:release"]).toBe("node tools/verify.mjs --profile release");
        expect(pkg.scripts["validate:assets"]).toBe("node tools/validate-assets.mjs");
        expect(pkg.scripts["validate:assets:laya"]).toBe("node tools/validate-assets.mjs --laya");
        expect(pkg.scripts["test:unit"]).toContain("tests/framework tests/game");
        expect(pkg.scripts["test:framework-sync"])
            .toBe("vitest run tests/workflow/FrameworkDistribution.test.ts");
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

    });

    it("creates a named game scope only after an explicit business name", () => {
        const pkg = JSON.parse(readFileSync("package.json", "utf8"));
        const project = JSON.parse(readFileSync("settings/GameProject.json", "utf8"));

        expect(pkg.scripts["validate:game-workflow"])
            .toContain('--name "Workflow Probe" --id workflow-probe --dry-run');
        expect(project).toMatchObject({ schemaVersion: 2, logicRoot: "src/game/logic" });
        expect(project).not.toHaveProperty("gameId");
        expect(existsSync("src/game/logic/AGENTS.md")).toBe(false);
        expect(existsSync("src/game/logic/.codex/memory/INDEX.md")).toBe(false);
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

    it("points missing local toolchains to the environment guide", () => {
        for (const path of [
            "tools/layaair.mjs",
            "tools/python-runtime.mjs",
            "tools/luban.mjs",
            "tools/test-browser.mjs",
            ".agents/skills/codex-workflow/scripts/test-skill-routing.mjs",
        ]) {
            expect(readFileSync(path, "utf8")).toContain("../Books/LXFamework-Environment.md");
        }
        const guide = readFileSync("../Books/LXFamework-Environment.md", "utf8");
        expect(guide).toContain("GitHub Actions 不代表开发者本机");
        expect(guide).toContain("不检查或安装 LayaAir、.NET、Python、浏览器和 Codex CLI");
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
            verification: [],
        };
        expect(assertRoutingResult(valid, definition)).toEqual({ routing: 1, decisions: 1, verification: 0 });
        expect(() => assertRoutingResult({ ...valid, results: [] }, definition)).toThrow(/missing routing/);
        expect(() => assertRoutingResult({ ...valid, decisions: [...valid.decisions, ...valid.decisions] }, definition))
            .toThrow(/Duplicate decision/);
        expect(() => assertRoutingResult({ ...valid, results: [...valid.results, { id: "extra", skills: [] }] }, definition))
            .toThrow(/unexpected routing/);
    });

    it("selects only requested cases while retaining competing Skill descriptions", () => {
        const evaluation = loadRoutingEvaluation(resolve("."), {}, ["--case", "approved_ui_fix"]);
        expect(evaluation.definition.cases.map(({ id }) => id)).toEqual(["approved_ui_fix"]);
        expect(evaluation.definition.decisions).toEqual([]);
        expect(evaluation.prompt).toContain('"name":"laya-scene"');
        expect(evaluation.prompt).not.toContain('"id":"negative_arithmetic"');
        expect(evaluation.prompt).not.toContain('"expected"');
    });

    it("loads only verification inputs for a verification-only selection", () => {
        const evaluation = loadRoutingEvaluation(resolve("."), {}, ["--group", "verification"]);
        expect(evaluation.definition.cases).toEqual([]);
        expect(evaluation.definition.decisions).toEqual([]);
        expect(evaluation.definition.verification?.length).toBeGreaterThan(0);
        expect(evaluation.prompt).not.toContain('"name":"laya-scene"');
        expect(evaluation.prompt).not.toContain('"expected"');
        expect(evaluation.prompt).toContain("## Verification");
        expect(evaluation.prompt).not.toContain("## Official references");
    });

    it("unions selectors without running selected cases twice", () => {
        const selected = selectEvaluationCases(definition, ["--group", "routing", "--case", "route", "--case", "decision"]);
        expect(selected.cases).toEqual(definition.cases);
        expect(selected.decisions).toEqual(definition.decisions);
    });

    it.each([
        ["--case", "typo"], ["--group", "typo"], ["--group", "toString"], ["--case"],
        ["--case", "route", "--case", "route"], ["--group", "verification"], ["--all"],
    ])("rejects invalid or empty selections rather than running everything: %j", (...args) => {
        expect(() => selectEvaluationCases(definition, args)).toThrow();
    });

    it("detects both excessive and insufficient verification", () => {
        const selected = { cases: [], decisions: [], verification: [
            { id: "local", request: "local task", expected: ["typecheck", "related_tests"] },
        ] };
        const result = (checks: string[]) => ({ results: [], decisions: [], verification: [{ id: "local", checks }] });
        expect(assertRoutingResult(result(["related_tests", "typecheck"]), selected).verification).toBe(1);
        for (const checks of [["typecheck"], ["typecheck", "related_tests", "verify"], ["typecheck", "related_tests", "typecheck"]]) {
            expect(() => assertRoutingResult(result(checks), selected)).toThrow(/expected/);
        }
        const valid = result(["typecheck", "related_tests"]);
        expect(() => assertRoutingResult({ ...valid, verification: [] }, selected)).toThrow(/missing verification/);
        expect(() => assertRoutingResult({ ...valid, verification: [...valid.verification, ...valid.verification] }, selected))
            .toThrow(/Duplicate verification/);
        expect(() => assertRoutingResult({ ...valid, verification: [...valid.verification, { id: "extra", checks: [] }] }, selected))
            .toThrow(/unexpected verification/);
    });
});
