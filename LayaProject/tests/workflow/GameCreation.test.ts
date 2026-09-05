import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const fixtureRoots: string[] = [];

afterEach(() => {
    const temporaryRoot = resolve(tmpdir());
    for (const fixture of fixtureRoots.splice(0)) {
        const local = relative(temporaryRoot, resolve(fixture));
        if (!local || local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)) {
            throw new Error(`Refusing unsafe fixture cleanup: ${fixture}`);
        }
        rmSync(fixture, { recursive: true, force: true });
    }
});

describe("named game creation", () => {
    it("creates an English game directory with its own Codex scope", () => {
        const fixture = createFixture();
        const output = execFileSync(process.execPath, [
            fixture.script,
            "--name", "梦境江湖",
            "--id", "dream-rivers",
        ], { encoding: "utf8" });
        const gameRoot = join(fixture.project, "src", "game", "dream-rivers");
        const agents = readFileSync(join(gameRoot, "AGENTS.md"), "utf8");

        expect(output).toContain("'梦境江湖' -> src/game/dream-rivers");
        expect(agents).toContain("# 梦境江湖");
        expect(agents).toContain("Game ID: `dream-rivers`");
        expect(agents).toContain("可调用 `src/game/logic/` 的公共业务逻辑");
        expect(existsSync(join(gameRoot, "AGENTS.md.meta"))).toBe(true);
        expect(existsSync(join(gameRoot, ".agents", "skills", "README.md"))).toBe(true);
        expect(existsSync(join(gameRoot, ".codex", "memory", "INDEX.md"))).toBe(true);
    });

    it("never treats reserved logic or bootstrap directories as a game", () => {
        const fixture = createFixture();
        for (const id of ["logic", "bootstrap"]) {
            const result = spawnSync(process.execPath, [fixture.script, "--name", "Reserved", "--id", id], {
                encoding: "utf8",
            });
            expect(result.status).not.toBe(0);
            expect(result.stderr).toContain("non-reserved English lowercase kebab-case game id");
            expect(existsSync(join(fixture.project, "src", "game", id))).toBe(false);
        }
    });
});

function createFixture(): { project: string; script: string } {
    const root = mkdtempSync(join(resolve(tmpdir()), "lx-game-create-"));
    fixtureRoots.push(root);
    const project = join(root, "LayaProject");
    const script = join(project, "tools", "create-game.mjs");
    mkdirSync(dirname(script), { recursive: true });
    copyFileSync(resolve("tools/create-game.mjs"), script);
    return { project, script };
}
