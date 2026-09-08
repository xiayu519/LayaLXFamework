export function evaluationPolicy(config: string, environment?: Record<string, string | undefined>): {model: string; effort: string};
export function evaluationArguments(policy: {model: string; effort: string}, schemaPath: string, resultPath: string): string[];
export function assertUsage(usage: unknown, inputLimit: number, outputLimit: number): void;
export function validateEvaluationSettings(settings: unknown): {
    codexCliVersion: string;
    routing: {inputTokens: number; outputTokens: number; timeoutMs: number};
};
export function assertToolFreeTranscript(events: readonly {type: string; item?: {type: string}; usage?: unknown}[]): unknown;
