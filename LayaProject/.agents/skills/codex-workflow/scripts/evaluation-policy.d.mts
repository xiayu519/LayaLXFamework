export function evaluationPolicy(config: string, environment?: Record<string, string | undefined>): {model: string; effort: string};
export function assertUsage(usage: unknown, inputLimit: number, outputLimit: number): void;
export function assertToolFreeTranscript(events: readonly {type: string; item?: {type: string}; usage?: unknown}[]): unknown;
