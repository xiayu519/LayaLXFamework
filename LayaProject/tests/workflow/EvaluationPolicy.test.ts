import { describe, expect, it } from "vitest";
import { evaluationPolicy, assertUsage, assertToolFreeTranscript } from "../../.agents/skills/codex-workflow/scripts/evaluation-policy.mjs";

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
});
