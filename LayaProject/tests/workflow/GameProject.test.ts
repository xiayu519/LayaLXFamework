import { describe, expect, it } from "vitest";
import { parseGameProject } from "../../tools/game-project.mjs";

const luban = {
    runtimeSupport: "src/game/logic/generated/luban/ByteBuf.ts",
    codeDestination: "src/game/logic/generated/tables",
    dataDestination: "assets/bootstrap/game/tables",
};

describe("game project configuration", () => {
    it("uses logicRoot without treating logic as a game id", () => {
        const config = parseGameProject({ schemaVersion: 2, logicRoot: "src/game/logic", luban });
        expect(config.logicRoot).toBe("src/game/logic");
        expect(config).not.toHaveProperty("gameId");
    });

    it("keeps schema 1 downstream configurations compatible during framework sync", () => {
        const config = parseGameProject({ schemaVersion: 1, gameId: "logic", luban });
        expect(config.logicRoot).toBe("src/game/logic");
        expect(config.gameRoot).toBeUndefined();
    });

    it("preserves the named game scope of older schema 1 projects", () => {
        const legacyLuban = {
            ...luban,
            runtimeSupport: "src/game/dream-rivers/generated/luban/ByteBuf.ts",
            codeDestination: "src/game/dream-rivers/generated/tables",
        };
        const config = parseGameProject({ schemaVersion: 1, gameId: "dream-rivers", luban: legacyLuban });
        expect(config.gameRoot).toBe("src/game/dream-rivers");
        expect(config.codeRoot).toBe("src/game/dream-rivers");
    });

    it("allows a named game to own its generated table code explicitly", () => {
        const gameLuban = {
            ...luban,
            runtimeSupport: "src/game/dream-rivers/generated/luban/ByteBuf.ts",
            codeDestination: "src/game/dream-rivers/generated/tables",
        };
        const config = parseGameProject({
            schemaVersion: 2,
            logicRoot: "src/game/logic",
            gameRoot: "src/game/dream-rivers",
            luban: gameLuban,
        });
        expect(config.codeRoot).toBe("src/game/dream-rivers");
    });

    it("rejects generated logic outside the configured root", () => {
        expect(() => parseGameProject({
            schemaVersion: 2,
            logicRoot: "src/game/logic",
            luban: { ...luban, codeDestination: "src/game/dream-rivers/generated/tables" },
        })).toThrow(/must stay inside src\/game\/logic/);
    });

    it("rejects reserved architecture directories as schema 2 game roots", () => {
        for (const id of ["logic", "bootstrap", "domain", "presentation"]) {
            expect(() => parseGameProject({
                schemaVersion: 2,
                logicRoot: "src/game/logic",
                gameRoot: `src/game/${id}`,
                luban,
            })).toThrow(/non-reserved English lowercase kebab-case game directory/);
        }
    });
});
