import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const fixtureRoots: string[] = [];
const script = resolve("tools/framework-distribution.mjs");

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

describe("framework distribution", () => {
    it("locks managed files, rejects downstream patches and restores through sync", () => {
        const source = fixture("lx-framework-source-");
        const destination = fixture("lx-framework-consumer-");
        writeJson(join(source, "framework.manifest.json"), {
            schemaVersion: 1,
            name: "LayaLXFamework",
            version: "1.0.0",
            repository: "https://example.invalid/LayaLXFamework.git",
            managedPaths: [
                "framework.manifest.json",
                "LayaProject/src/framework/**",
            ],
            jsonContracts: {
                "LayaProject/package.json": {
                    scripts: { "check:framework-integrity": "node tools/framework-distribution.mjs check" },
                },
            },
        });
        write(join(source, "LayaProject", "src", "framework", "Example.ts"), "export const value = 1;\n");
        git(source, "init");
        git(source, "config", "user.name", "Framework Test");
        git(source, "config", "user.email", "framework-test@example.invalid");
        git(source, "add", ".");
        git(source, "commit", "-m", "test: publish fixture");
        git(source, "tag", "v1.0.0");

        run("sync", "--source", source, "--destination", destination, "--ref", "v1.0.0");
        expect(run("check", "--destination", destination)).toContain("Framework integrity OK");
        expect(run("upstream", "--source", source, "--destination", destination)).toContain("Framework upstream OK");

        const managedFile = join(destination, "LayaProject", "src", "framework", "Example.ts");
        write(managedFile, "export const value = 2;\n");
        expect(() => run("check", "--destination", destination)).toThrow(/Framework integrity check failed/);

        const lockPath = join(destination, ".framework-lock.json");
        const lock = JSON.parse(readFileSync(lockPath, "utf8"));
        const entry = lock.files.find((item: { path: string }) => item.path.endsWith("Example.ts"));
        if (!entry) {
            throw new Error("Fixture lock did not contain Example.ts.");
        }
        entry.sha256 = createHash("sha256").update(readFileSync(managedFile)).digest("hex");
        entry.size = statSync(managedFile).size;
        writeJson(lockPath, lock);
        expect(run("check", "--destination", destination)).toContain("Framework integrity OK");
        expect(() => run("upstream", "--source", source, "--destination", destination))
            .toThrow(/Framework upstream verification failed/);

        write(join(destination, "LayaProject", "src", "framework", "DownstreamPatch.ts"), "export {};\n");
        expect(() => run("check", "--destination", destination)).toThrow(/unlocked/);

        run("sync", "--source", source, "--destination", destination, "--ref", "v1.0.0");
        expect(run("check", "--destination", destination)).toContain("Framework integrity OK");
    });
});

function fixture(prefix: string): string {
    const root = mkdtempSync(join(tmpdir(), prefix));
    fixtureRoots.push(root);
    return root;
}

function git(cwd: string, ...args: string[]): void {
    execFileSync("git", args, { cwd, stdio: "ignore" });
}

function run(...args: string[]): string {
    return execFileSync(process.execPath, [script, ...args], {
        cwd: resolve("."),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });
}

function write(path: string, source: string): void {
    mkdirSync(resolve(path, ".."), { recursive: true });
    writeFileSync(path, source, "utf8");
}

function writeJson(path: string, value: unknown): void {
    write(path, `${JSON.stringify(value, null, 2)}\n`);
}
