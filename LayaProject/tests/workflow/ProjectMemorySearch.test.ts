import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

describe("project memory search", () => {
    it("hides retired model instructions by default and labels explicit history", () => {
        const script = resolve(".agents/skills/project-memory/scripts/project-memory.mjs");
        const search = (...args: string[]) => execFileSync(process.execPath, [script, "search", ...args], {
            cwd: resolve("."), encoding: "utf8",
        });
        const active = search("codex", "--limit", "10");
        expect(active).toContain("| active |");
        expect(active).not.toContain("| superseded |");
        expect(active).not.toContain("codex-model-floor.md");
        const historical = search("codex-model-floor", "--include-history", "--limit", "10");
        expect(historical).toContain("codex-model-floor.md | superseded |");
        expect(search("AbsentMemoryMarker123456789")).toBe("No project memory matched.\n");
    });

    it("finds an active body-only match without resurrecting history", () => {
        const temporaryRoot = resolve(tmpdir());
        const fixture = mkdtempSync(join(temporaryRoot, "lx-memory-status-"));
        try {
            const script = join(fixture, ".agents", "skills", "project-memory", "scripts", "project-memory.mjs");
            mkdirSync(dirname(script), { recursive: true });
            copyFileSync(resolve(".agents/skills/project-memory/scripts/project-memory.mjs"), script);
            for (const status of ["active", "superseded", "archived"]) {
                write(join(fixture, ".codex", "memory", "decisions", `${status}.md`),
                    `---\ntype: decision\nscope: fixture\ndescription: Unrelated summary\ntrigger: Unrelated trigger\nstatus: ${status}\n---\n# Unrelated title\nOnlyBodyMarker\n`);
            }
            const output = execFileSync(process.execPath, [script, "search", "OnlyBodyMarker"], {
                cwd: fixture, encoding: "utf8",
            });
            expect(output).toContain("active.md | active |");
            expect(output).not.toContain("superseded.md");
            expect(output).not.toContain("archived.md");
        } finally {
            if (dirname(fixture) !== temporaryRoot) throw new Error(`Unsafe fixture: ${fixture}`);
            rmSync(fixture, { recursive: true, force: true });
        }
    });

    it("tokenizes one quoted multi-keyword query", () => {
        const script = resolve(".agents/skills/project-memory/scripts/project-memory.mjs");
        const output = execFileSync(process.execPath, [
            script,
            "search",
            "Laya 源码 原生 生命周期 资源",
            "--limit",
            "3",
        ], { cwd: resolve("."), encoding: "utf8" });

        expect(output).toContain(".codex/memory/");
        expect(output).not.toContain("No project memory matched.");
    });

    it("preserves model names, versions and filenames without matching their numeric fragments", () => {
        const temporaryRoot = resolve(tmpdir());
        const fixture = mkdtempSync(join(temporaryRoot, "lx-memory-identifiers-"));
        try {
            const script = join(fixture, ".agents/skills/project-memory/scripts/project-memory.mjs");
            mkdirSync(dirname(script), { recursive: true });
            copyFileSync(resolve(".agents/skills/project-memory/scripts/project-memory.mjs"), script);
            for (const [name, body] of [
                ["model-policy", "GPT-6 and LayaAir 3.4.1"],
                ["unrelated", "2026 timer limits 2_147_483_647"],
            ]) {
                write(join(fixture, `.codex/memory/decisions/${name}.md`),
                    `---\ntype: decision\nscope: fixture\ndescription: Example\ntrigger: Example\nstatus: active\n---\n# Example\n${body}\n`);
            }
            for (const query of ["GPT-6", "ＧＰＴ－６", "3.4.1", "model-policy"]) {
                const output = execFileSync(process.execPath, [script, "search", query], {
                    cwd: fixture, encoding: "utf8",
                });
                expect(output).toContain("model-policy.md | active |");
                expect(output).not.toContain("unrelated.md");
            }
        } finally {
            if (dirname(fixture) !== temporaryRoot) throw new Error(`Unsafe fixture: ${fixture}`);
            rmSync(fixture, { recursive: true, force: true });
        }
    });

    it("layers the active game memory over public memory", () => {
        const temporaryRoot = resolve(tmpdir());
        const fixture = mkdtempSync(join(temporaryRoot, "lx-project-memory-"));
        try {
            const script = join(fixture, ".agents", "skills", "project-memory", "scripts", "project-memory.mjs");
            mkdirSync(dirname(script), { recursive: true });
            copyFileSync(resolve(".agents/skills/project-memory/scripts/project-memory.mjs"), script);

            const gameMemory = join(fixture, "src", "game", "dream-rivers", ".codex", "memory");
            write(join(fixture, ".codex", "memory", "INDEX.md"), memoryIndex());
            write(join(gameMemory, "INDEX.md"), `${memoryIndex()}\n- [Logic ownership](decisions/logic-ownership.md)\n`);
            write(join(gameMemory, "decisions", "logic-ownership.md"), `---
type: decision
scope: fixture-game
description: Logic fixture ownership.
trigger: Testing layered memory search.
status: active
last_verified: 2026-09-05
source: code-verified
---

# Logic ownership

The logic fixture is game-owned.
`);

            const output = execFileSync(process.execPath, [
                script,
                "search",
                "logic fixture ownership",
            ], { cwd: join(fixture, "src", "game", "dream-rivers"), encoding: "utf8" });

            expect(output).toContain("src/game/dream-rivers/.codex/memory/decisions/logic-ownership.md");
        } finally {
            const local = relative(temporaryRoot, resolve(fixture));
            if (!local || local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)) {
                throw new Error(`Refusing unsafe fixture cleanup: ${fixture}`);
            }
            rmSync(fixture, { recursive: true, force: true });
        }
    });

    it("does not treat the reserved logic library as a game memory scope", () => {
        const temporaryRoot = resolve(tmpdir());
        const fixture = mkdtempSync(join(temporaryRoot, "lx-project-memory-logic-"));
        try {
            const script = join(fixture, ".agents", "skills", "project-memory", "scripts", "project-memory.mjs");
            mkdirSync(dirname(script), { recursive: true });
            copyFileSync(resolve(".agents/skills/project-memory/scripts/project-memory.mjs"), script);
            const logicMemory = join(fixture, "src", "game", "logic", ".codex", "memory");
            write(join(fixture, ".codex", "memory", "INDEX.md"), memoryIndex());
            write(join(logicMemory, "INDEX.md"), `${memoryIndex()}\n- [Reserved](decisions/reserved.md)\n`);
            write(join(logicMemory, "decisions", "reserved.md"), `---
type: decision
scope: fixture
description: Reserved logic memory must not become a game scope.
trigger: Testing reserved logic memory.
status: active
last_verified: 2026-09-05
source: code-verified
---

# Reserved

This entry must stay inactive.
`);

            const output = execFileSync(process.execPath, [
                script,
                "search",
                "reserved logic memory",
            ], { cwd: join(fixture, "src", "game", "logic"), encoding: "utf8" });

            expect(output).toContain("No project memory matched.");
            expect(output).not.toContain("src/game/logic/.codex/memory");
        } finally {
            const local = relative(temporaryRoot, resolve(fixture));
            if (!local || local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)) {
                throw new Error(`Refusing unsafe fixture cleanup: ${fixture}`);
            }
            rmSync(fixture, { recursive: true, force: true });
        }
    });
});

function memoryIndex(): string {
    return "# Project Memory\n\n## Problems\n\n## Decisions\n\n## Feedback\n";
}

function write(path: string, source: string): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source, "utf8");
}
