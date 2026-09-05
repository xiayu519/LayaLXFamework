export interface LubanProjectPaths {
    readonly runtimeSupport: string;
    readonly codeDestination: string;
    readonly dataDestination: string;
}

export type ParsedGameProject = Readonly<Record<string, unknown> & {
    readonly schemaVersion: 1 | 2;
    readonly logicRoot: string;
    readonly gameRoot?: string;
    readonly codeRoot: string;
    readonly luban: LubanProjectPaths;
}>;

export function parseGameProject(value: unknown): ParsedGameProject;
