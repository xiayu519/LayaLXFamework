import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

describe("project memory search", () => {
    it("reports evidence provenance and rejects the removed history option", () => {
        const script = resolve(".agents/skills/project-memory/scripts/project-memory.mjs");
        const search = (...args: string[]) => execFileSync(process.execPath, [script, "search", ...args], {
            cwd: resolve("."), encoding: "utf8",
        });
        const active = search("codex", "--limit", "10");
        expect(active).toContain("| active |");
        expect(active).not.toContain("| superseded |");
        expect(active).toContain("Project memory is recall only;");
        expect(active).toMatch(/verified: \d{4}-\d{2}-\d{2} \| source: (user-confirmed|code-verified|external-verified)/);
        const historical = spawnSync(process.execPath, [script, "search", "codex", "--include-history"], {
            cwd: resolve("."), encoding: "utf8",
        });
        expect(historical.status).toBe(2);
        expect(historical.stdout).toBe("");
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

    it("does not match storage prefixes or administrative metadata as subject matter", () => {
        const temporaryRoot = resolve(tmpdir());
        const fixture = mkdtempSync(join(temporaryRoot, "lx-memory-noise-"));
        try {
            const script = join(fixture, ".agents/skills/project-memory/scripts/project-memory.mjs");
            write(script, "");
            copyFileSync(resolve(".agents/skills/project-memory/scripts/project-memory.mjs"), script);
            write(join(fixture, ".codex/memory/problems/loading.md"), `---
type: problem
scope: loading
description: Example
trigger: Example
status: active
last_verified: 2026-09-09
source: code-verified
---
# Loading
OnlyBodyMarker
`);
            for (const query of ["codex", "memory", "2026-09-09", "code-verified", "active"]) {
                expect(execFileSync(process.execPath, [script, "search", query], {
                    cwd: fixture, encoding: "utf8",
                })).toBe("No project memory matched.\n");
            }
            expect(execFileSync(process.execPath, [script, "search", "OnlyBodyMarker"], {
                cwd: fixture, encoding: "utf8",
            })).toContain("loading.md | active |");
        } finally {
            if (dirname(fixture) !== temporaryRoot) throw new Error(`Unsafe fixture: ${fixture}`);
            rmSync(fixture, { recursive: true, force: true });
        }
    });

    it("checks retired entries and broken evidence links in public and game scopes", () => {
        const temporaryRoot = resolve(tmpdir());
        const fixture = mkdtempSync(join(temporaryRoot, "lx-memory-check-"));
        try {
            const script = join(fixture, ".agents/skills/project-memory/scripts/project-memory.mjs");
            write(script, "");
            copyFileSync(resolve(".agents/skills/project-memory/scripts/project-memory.mjs"), script);
            for (const scope of [".codex/memory", "src/game/example/.codex/memory"]) {
                write(join(fixture, scope, "INDEX.md"), memoryIndex() + "\n- [Entry](decisions/entry.md)\n");
                write(join(fixture, scope, "evidence.txt"), "Verified input");
                const entryPath = join(fixture, scope, "decisions/entry.md");
                const entry = `---\ntype: decision\nscope: fixture\ndescription: Example\ntrigger: Example\nstatus: active\nlast_verified: 2026-09-09\nsource: code-verified\n---\n# Entry\n[Evidence](../evidence.txt)\n`;
                const check = () => spawnSync(process.execPath, [script, "check"], { cwd: fixture, encoding: "utf8" });
                write(entryPath, entry);
                expect(check().status).toBe(0);
                for (const status of ["superseded", "archived", "unknown"]) {
                    write(entryPath, entry.replace("status: active", `status: ${status}`));
                    const result = check();
                    expect(result.status).toBe(1);
                    expect(result.stderr).toContain(`${scope}/decisions/entry.md must be active`);
                }
                write(entryPath, entry.replace("../evidence.txt", "../missing.txt"));
                const result = check();
                expect(result.status).toBe(1);
                expect(result.stderr).toContain(`${scope}/decisions/entry.md target does not exist: ../missing.txt`);
                write(entryPath, entry);
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
            write(join(fixture, ".codex/memory/decisions/public.md"), "---\nstatus: active\nscope: fixture\ndescription: Public ownership\n---\n# Public ownership\n");
            write(join(fixture, "src/game/another/.codex/memory/decisions/private.md"), "---\nstatus: active\nscope: fixture\ndescription: Private ownership\n---\n# Private ownership\n");

            const output = execFileSync(process.execPath, [
                script,
                "search",
                "logic fixture ownership",
            ], { cwd: join(fixture, "src", "game", "dream-rivers"), encoding: "utf8" });

            expect(output).toContain("src/game/dream-rivers/.codex/memory/decisions/logic-ownership.md");
            expect(output).toContain(".codex/memory/decisions/public.md");
            expect(output).not.toContain("src/game/another/");
            const publicOutput = execFileSync(process.execPath, [script, "search", "ownership"], {
                cwd: fixture, encoding: "utf8",
            });
            expect(publicOutput).toContain(".codex/memory/decisions/public.md");
            expect(publicOutput).not.toContain("src/game/");
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
