/** Read only root scalar fields used by evaluation; do not attempt to reimplement TOML. */
export function evaluationPolicy(config, environment = {}) {
    const root = config.split(/^\s*\[/m, 1)[0];
    const field = (name) => {
        const values = [...root.matchAll(new RegExp(`^${name}\\s*=\\s*"([^"\\r\\n]+)"\\s*(?:#.*)?$`, "gm"))];
        if (values.length !== 1) throw new Error(`Expected one root string '${name}' in .codex/config.toml.`);
        return values[0][1];
    };
    const model = environment.LX_CODEX_EVAL_MODEL ?? field("model");
    const effort = environment.LX_CODEX_EVAL_EFFORT ?? field("model_reasoning_effort");
    if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error("Invalid evaluation model.");
    if (!["low", "medium", "high", "xhigh", "max"].includes(effort)) {
        throw new Error("Invalid evaluation effort: use low, medium, high, xhigh or max; Ultra is a delegation mode.");
    }
    return { model, effort };
}

export function evaluationArguments({ model, effort }, schemaPath, resultPath) {
    return [
        "exec", "--ephemeral", "--ignore-user-config", "--skip-git-repo-check",
        "--sandbox", "read-only", "--disable", "plugins", "--disable", "apps",
        "--model", model, "-c", `model_reasoning_effort="${effort}"`,
        "--json", "--output-schema", schemaPath, "--output-last-message", resultPath, "-",
    ];
}

export function assertUsage(usage, inputLimit, outputLimit) {
    for (const [key, limit] of [["input_tokens", inputLimit], ["output_tokens", outputLimit]]) {
        if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error(`Invalid ${key} limit: ${limit}.`);
        if (!Number.isSafeInteger(usage?.[key]) || usage[key] < 0 || usage[key] > limit) {
            throw new Error(`Invalid or over-budget ${key}: ${usage?.[key]} (limit ${limit}).`);
        }
    }
}

export function validateEvaluationSettings(settings) {
    if (!/^\d+\.\d+\.\d+$/.test(settings?.codexCliVersion ?? "")) {
        throw new Error("Invalid Codex CLI version in evaluation policy.");
    }
    assertUsage({ input_tokens: 0, output_tokens: 0 }, settings.routing?.inputTokens, settings.routing?.outputTokens);
    if (!Number.isSafeInteger(settings.routing?.timeoutMs) || settings.routing.timeoutMs <= 0) {
        throw new Error("Invalid evaluation timeout.");
    }
    return settings;
}

/** A routing classifier must not read its expected answers or perform any task actions. */
export function assertToolFreeTranscript(events) {
    const completed = events.filter((event) => event.type === "turn.completed");
    if (completed.length !== 1) throw new Error("Expected exactly one completed evaluation turn.");
    for (const event of events) {
        if (event.item && !["reasoning", "agent_message"].includes(event.item.type)) {
            throw new Error(`Evaluation performed a forbidden action: ${event.item.type}.`);
        }
        if (/tool|command|file_change|web_search/i.test(event.type)) {
            throw new Error(`Evaluation performed a forbidden event: ${event.type}.`);
        }
    }
    return completed[0].usage;
}
