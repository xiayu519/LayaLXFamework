export function resolveComponentScript(
    assetsRoot: string,
    hierarchyPath: string,
    scriptPath: string,
    uuid: unknown,
    readScriptUuid: (path: string) => string | undefined,
): string;
