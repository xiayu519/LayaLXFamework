const gameIdPattern = /^[a-z][a-z0-9-]*$/;
const reservedGameIds = new Set([
    "application", "bootstrap", "domain", "generated", "infrastructure", "logic", "platform", "presentation",
]);

export function parseGameProject(value) {
    const legacyGameId = value?.schemaVersion === 1
        && typeof value.gameId === "string"
        && gameIdPattern.test(value.gameId)
        ? value.gameId
        : undefined;
    const legacyRoot = legacyGameId ? `src/game/${legacyGameId}` : undefined;
    const logicRoot = value?.schemaVersion === 2 && value.logicRoot === "src/game/logic"
        ? value.logicRoot
        : legacyRoot;
    const gameRoot = value?.schemaVersion === 2 && value.gameRoot !== undefined
        ? readNamedGameRoot(value.gameRoot)
        : legacyGameId && legacyGameId !== "logic"
            ? legacyRoot
            : undefined;
    const codeRoot = gameRoot ?? logicRoot;
    if (!logicRoot || !codeRoot
        || typeof value?.luban?.runtimeSupport !== "string"
        || typeof value?.luban?.codeDestination !== "string"
        || typeof value?.luban?.dataDestination !== "string") {
        throw new Error("GameProject must define schema 2 logicRoot and its Luban runtime/code/data destinations.");
    }
    for (const label of ["runtimeSupport", "codeDestination"]) {
        if (!value.luban[label].startsWith(`${codeRoot}/`)) {
            throw new Error(`GameProject luban.${label} must stay inside ${codeRoot}.`);
        }
    }
    return Object.freeze({ ...value, logicRoot, gameRoot, codeRoot });
}

function readNamedGameRoot(value) {
    const match = typeof value === "string" ? /^src\/game\/([a-z][a-z0-9-]*)$/.exec(value) : undefined;
    if (!match || reservedGameIds.has(match[1])) {
        throw new Error("GameProject gameRoot must identify a non-reserved English lowercase kebab-case game directory.");
    }
    return value;
}
