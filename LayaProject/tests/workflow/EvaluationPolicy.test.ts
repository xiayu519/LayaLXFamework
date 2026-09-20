import { describe, expect, it } from "vitest";
import { evaluationPolicy, evaluationArguments, assertUsage, assertToolFreeTranscript, validateEvaluationSettings } from "../../.agents/skills/codex-workflow/scripts/evaluation-policy.mjs";

describe("evaluation policy", () => {
    const settings = {
        codexCliVersion: "0.153.2",
        compatibility: { model: "gpt-5.6-sol", defaultEffort: "medium", efforts: ["medium", "high", "xhigh"] },
        routing: { inputTokens: 100, outputTokens: { medium: 100, high: 150, xhigh: 200 }, timeoutMs: 1000 },
    };
    it("rejects tool use that could read expected answers or mutate state", () => {
        const completed = { type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } };
        for (const type of ["command_execution", "mcp_tool_call", "web_search", "file_change", "future_tool"]) {
            expect(() => assertToolFreeTranscript([{ type: "item.completed", item: { type } }, completed])).toThrow();
        }
        expect(assertToolFreeTranscript([{ type: "item.completed", item: { type: "agent_message" } }, completed]))
            .toEqual(completed.usage);
        expect(() => assertToolFreeTranscript([completed, completed])).toThrow();
    });
    it("uses the compatibility baseline or explicit evaluation overrides", () => {
        expect(evaluationPolicy(settings)).toEqual({ model: "gpt-5.6-sol", effort: "medium" });
        expect(evaluationPolicy(settings, { LX_CODEX_EVAL_MODEL: "chosen-model", LX_CODEX_EVAL_EFFORT: "xhigh" }))
            .toEqual({ model: "chosen-model", effort: "xhigh" });
        expect(() => evaluationPolicy(settings, { LX_CODEX_EVAL_MODEL: "bad model" })).toThrow();
        expect(() => evaluationPolicy(settings, { LX_CODEX_EVAL_EFFORT: "unknown" })).toThrow();
    });
    it("never interprets missing, NaN, negative or excessive token counts as success", () => {
        for (const value of [undefined, NaN, -1, 11, 1.5, "1"]) {
            expect(() => assertUsage({ input_tokens: value, output_tokens: 1 }, 10, 10)).toThrow();
        }
        expect(() => assertUsage({ input_tokens: 10, output_tokens: 10 }, 10, 10)).not.toThrow();
    });
    it.each(["medium", "high", "xhigh"])("passes the supported %s without changing the model", (effort) => {
        const policy = evaluationPolicy(settings, { LX_CODEX_EVAL_EFFORT: effort });
        expect(policy).toEqual({ model: "gpt-5.6-sol", effort });
        const args = evaluationArguments(policy, "schema path.json", "output path.json");
        expect(args).toContain(`model_reasoning_effort="${effort}"`);
        expect(args.slice(-5)).toEqual(["--output-schema", "schema path.json", "--output-last-message", "output path.json", "-"]);
    });
    it.each(["none", "minimal", "low", "light", "max", "ultra"])("rejects unsupported compatibility effort %s before invoking the model", (effort) => {
        expect(() => evaluationPolicy(settings, { LX_CODEX_EVAL_EFFORT: effort })).toThrow(/Invalid evaluation effort/);
    });
    it("rejects incomplete or invalid budgets before invoking the CLI", () => {
        expect(validateEvaluationSettings(settings)).toEqual(settings);
        for (const invalid of [undefined, null, {}, { ...settings, codexCliVersion: "latest" }]) {
            expect(() => validateEvaluationSettings(invalid)).toThrow();
        }
        for (const key of ["inputTokens", "timeoutMs"]) {
            for (const value of [undefined, null, "100", 0, -1, NaN, Infinity]) {
                expect(() => validateEvaluationSettings({ ...settings, routing: { ...settings.routing, [key]: value } })).toThrow();
            }
        }
        for (const effort of settings.compatibility.efforts) {
            expect(() => validateEvaluationSettings({ ...settings, routing: { ...settings.routing,
                outputTokens: { ...settings.routing.outputTokens, [effort]: 0 } } })).toThrow();
        }
        expect(() => validateEvaluationSettings({ ...settings,
            compatibility: { ...settings.compatibility, efforts: ["low", "medium", "high", "xhigh"] } })).toThrow();
    });
});
