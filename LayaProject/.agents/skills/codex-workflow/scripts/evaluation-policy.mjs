/** 评测基线独立于开发者的日常模型选择；环境变量只用于显式比较。 */
export function evaluationPolicy(settings, environment = {}) {
    const model = environment.LX_CODEX_EVAL_MODEL ?? settings?.compatibility?.model;
    const effort = environment.LX_CODEX_EVAL_EFFORT ?? settings?.compatibility?.defaultEffort;
    const efforts = settings?.compatibility?.efforts;
    if (typeof model !== "string" || !/^[a-zA-Z0-9._-]+$/.test(model)) {
        throw new Error("Invalid evaluation model.");
    }
    if (!Array.isArray(efforts) || typeof effort !== "string" || !efforts.includes(effort)) {
        throw new Error(`Invalid evaluation effort: use ${Array.isArray(efforts) ? efforts.join(", ") : "configured efforts"}.`);
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
    const compatibility = settings?.compatibility;
    if (!/^[a-zA-Z0-9._-]+$/.test(compatibility?.model ?? "")) {
        throw new Error("Invalid compatibility model in evaluation policy.");
    }
    const efforts = compatibility?.efforts;
    if (!Array.isArray(efforts) || JSON.stringify(efforts) !== JSON.stringify(["high", "xhigh"])
        || !efforts.includes(compatibility.defaultEffort)) {
        throw new Error("Compatibility efforts must be high and xhigh with a supported default.");
    }
    for (const effort of efforts) {
        assertUsage({ input_tokens: 0, output_tokens: 0 }, settings.routing?.inputTokens,
            settings.routing?.outputTokens?.[effort]);
    }
    if (!Number.isSafeInteger(settings.routing?.timeoutMs) || settings.routing.timeoutMs <= 0) {
        throw new Error("Invalid evaluation timeout.");
    }
    return settings;
}

/** 路由分类器不得读取预期答案，也不得执行任务操作。 */
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
