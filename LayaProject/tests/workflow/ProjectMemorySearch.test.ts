import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("project memory search", () => {
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

    it("layers the active game memory over public memory", () => {
        const script = resolve(".agents/skills/project-memory/scripts/project-memory.mjs");
        const output = execFileSync(process.execPath, [
            script,
            "search",
            "sample 验收游戏 所有权",
        ], { cwd: resolve("src/game/sample"), encoding: "utf8" });

        expect(output).toContain("src/game/sample/.codex/memory/decisions/sample-ownership.md");
    });
});
