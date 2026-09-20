type EvaluationSettings = {
    codexCliVersion: string;
    compatibility: {model: string; defaultEffort: string; efforts: string[]};
    routing: {inputTokens: number; outputTokens: Record<string, number>; timeoutMs: number};
};
export function evaluationPolicy(settings: EvaluationSettings, environment?: Record<string, string | undefined>): {model: string; effort: string};
export function evaluationArguments(policy: {model: string; effort: string}, schemaPath: string, resultPath: string): string[];
export function assertUsage(usage: unknown, inputLimit: number, outputLimit: number): void;
export function validateEvaluationSettings(settings: unknown): EvaluationSettings;
export function assertToolFreeTranscript(events: readonly {type: string; item?: {type: string}; usage?: unknown}[]): unknown;
