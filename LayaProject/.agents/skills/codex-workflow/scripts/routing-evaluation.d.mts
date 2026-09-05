export interface RoutingDefinition {
    cases: Array<{id: string; request: string; expected: string[]}>;
    decisions: Array<{id: string; request: string; expected: string}>;
}
export function loadRoutingEvaluation(projectRoot: string, environment?: Record<string, string | undefined>): {
    definition: RoutingDefinition;
    policy: {model: string; effort: string};
    prompt: string;
};
export function buildRoutingPrompt(input: {
    cases: RoutingDefinition["cases"];
    decisions: RoutingDefinition["decisions"];
    skills: Array<{name: string; description: string}>;
    workflowRules: string;
}): string;
export function assertRoutingResult(actual: unknown, definition: RoutingDefinition): {routing: number; decisions: number};
