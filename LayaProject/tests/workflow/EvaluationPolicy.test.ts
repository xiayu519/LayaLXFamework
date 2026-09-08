import { describe, expect, it } from "vitest";
import { evaluationPolicy, evaluationArguments, assertUsage, assertToolFreeTranscript, validateEvaluationSettings } from "../../.agents/skills/codex-workflow/scripts/evaluation-policy.mjs";

describe("evaluation policy", () => {
    it("rejects tool use that could read expected answers or mutate state", () => {
        const completed = { type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } };
        for (const type of ["command_execution", "mcp_tool_call", "web_search", "file_change", "future_tool"]) {
            expect(() => assertToolFreeTranscript([{ type: "item.completed", item: { type } }, completed])).toThrow();
        }
        expect(assertToolFreeTranscript([{ type: "item.completed", item: { type: "agent_message" } }, completed]))
            .toEqual(completed.usage);
        expect(() => assertToolFreeTranscript([completed, completed])).toThrow();
    });
    const config = 'model = "configured-model"\nmodel_reasoning_effort = "high"\n[features]\nmodel = "not-the-default"';
    it("uses only the project's root defaults or explicit overrides", () => {
        expect(evaluationPolicy(config)).toEqual({ model: "configured-model", effort: "high" });
        expect(evaluationPolicy(config, { LX_CODEX_EVAL_MODEL: "chosen-model", LX_CODEX_EVAL_EFFORT: "xhigh" }))
            .toEqual({ model: "chosen-model", effort: "xhigh" });
        expect(() => evaluationPolicy("[features]\nmodel = \"wrong\"")).toThrow();
        expect(() => evaluationPolicy(config, { LX_CODEX_EVAL_EFFORT: "unknown" })).toThrow();
    });
    it("never interprets missing, NaN, negative or excessive token counts as success", () => {
        for (const value of [undefined, NaN, -1, 11, 1.5, "1"]) {
            expect(() => assertUsage({ input_tokens: value, output_tokens: 1 }, 10, 10)).toThrow();
        }
        expect(() => assertUsage({ input_tokens: 10, output_tokens: 10 }, 10, 10)).not.toThrow();
    });
    it.each(["low", "medium", "high", "xhigh", "max"])("passes the explicitly chosen %s without changing the model", (effort) => {
        const policy = evaluationPolicy(config, { LX_CODEX_EVAL_EFFORT: effort });
        expect(policy).toEqual({ model: "configured-model", effort });
        const args = evaluationArguments(policy, "schema path.json", "output path.json");
        expect(args).toContain(`model_reasoning_effort="${effort}"`);
        expect(args.slice(-5)).toEqual(["--output-schema", "schema path.json", "--output-last-message", "output path.json", "-"]);
    });
    it.each(["none", "minimal", "light", "exhigh", "ultra"])("rejects nonstandard single-agent effort %s before invoking the model", (effort) => {
        expect(() => evaluationPolicy(config, { LX_CODEX_EVAL_EFFORT: effort })).toThrow(/Invalid evaluation effort/);
    });
    it("rejects incomplete or invalid budgets before invoking the CLI", () => {
        const settings = { codexCliVersion: "0.153.2", routing: { inputTokens: 100, outputTokens: 100, timeoutMs: 1000 } };
        expect(validateEvaluationSettings(settings)).toEqual(settings);
        for (const invalid of [undefined, null, {}, { ...settings, codexCliVersion: "latest" }]) {
            expect(() => validateEvaluationSettings(invalid)).toThrow();
        }
        for (const key of ["inputTokens", "outputTokens", "timeoutMs"]) {
            for (const value of [undefined, null, "100", 0, -1, NaN, Infinity]) {
                expect(() => validateEvaluationSettings({ ...settings, routing: { ...settings.routing, [key]: value } })).toThrow();
            }
        }
    });
});
