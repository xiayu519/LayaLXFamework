import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const fixtureRoots: string[] = [];
const script = resolve("tools/framework-distribution.mjs");
const distributionTestTimeoutMs = 20_000;

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

        const lockPath = join(destination, ".framework-lock.json");
        const currentLock = JSON.parse(readFileSync(lockPath, "utf8"));
        expect(currentLock).toMatchObject({
            schemaVersion: 2,
            source: { mode: "release", ref: "v1.0.0" },
            manifestVersion: "1.0.0",
        });
        const { source: _source, manifestVersion: _manifestVersion, ...legacyLock } = currentLock;
        writeJson(lockPath, { ...legacyLock, schemaVersion: 1, version: "v1.0.0" });
        expect(run("check", "--destination", destination)).toContain("Framework integrity OK");
        expect(run("upstream", "--source", source, "--destination", destination)).toContain("Framework upstream OK");
        run("sync", "--source", source, "--destination", destination, "--ref", "v1.0.0");

        const managedFile = join(destination, "LayaProject", "src", "framework", "Example.ts");
        write(managedFile, "export const value = 2;\n");
        expect(() => run("check", "--destination", destination)).toThrow(/Framework integrity check failed/);

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
    }, distributionTestTimeoutMs);

    it("updates a channel snapshot explicitly while keeping the previous commit reproducible", () => {
        const source = fixture("lx-framework-channel-source-");
        const destination = fixture("lx-framework-channel-consumer-");
        writeJson(join(source, "framework.manifest.json"), {
            schemaVersion: 1,
            name: "LayaLXFamework",
            version: "1.0.0",
            repository: "https://example.invalid/LayaLXFamework.git",
            managedPaths: [
                "framework.manifest.json",
                "LayaProject/src/framework/**",
            ],
        });
        const managedFile = join(source, "LayaProject", "src", "framework", "Example.ts");
        write(managedFile, "export const value = 1;\n");
        git(source, "init");
        git(source, "config", "user.name", "Framework Test");
        git(source, "config", "user.email", "framework-test@example.invalid");
        git(source, "add", ".");
        git(source, "commit", "-m", "test: initial channel snapshot");
        git(source, "branch", "-M", "main");

        run("sync", "--repository", source, "--destination", destination, "--channel", "main");
        const firstLock = JSON.parse(readFileSync(join(destination, ".framework-lock.json"), "utf8"));
        expect(firstLock).toMatchObject({
            schemaVersion: 2,
            source: { mode: "snapshot", ref: "main" },
            manifestVersion: "1.0.0",
        });
        expect(readFileSync(join(destination, "LayaProject", "src", "framework", "Example.ts"), "utf8"))
            .toBe("export const value = 1;\n");

        write(managedFile, "export const value = 2;\n");
        git(source, "add", ".");
        git(source, "commit", "-m", "test: advance channel");
        expect(run("upstream", "--repository", source, "--destination", destination))
            .toContain(firstLock.commit);

        run("sync", "--repository", source, "--destination", destination, "--channel", "main");
        const secondLock = JSON.parse(readFileSync(join(destination, ".framework-lock.json"), "utf8"));
        expect(secondLock.commit).not.toBe(firstLock.commit);
        expect(secondLock.source).toEqual({ mode: "snapshot", ref: "main" });
        expect(readFileSync(join(destination, "LayaProject", "src", "framework", "Example.ts"), "utf8"))
            .toBe("export const value = 2;\n");
        expect(run("check", "--destination", destination)).toContain("main snapshot");
        expect(gitOutput(source, "tag")).toBe("");
    }, distributionTestTimeoutMs);

    it("removes GitHub workflows retired by a newer framework manifest", () => {
        const source = fixture("lx-framework-workflow-source-");
        const destination = fixture("lx-framework-workflow-consumer-");
        const manifestPath = join(source, "framework.manifest.json");
        const legacyWorkflow = join(source, ".github", "workflows", "release-validation.yml");
        const syncWorkflow = join(source, ".github", "workflows", "framework-sync.yml");
        writeJson(manifestPath, {
            schemaVersion: 1,
            name: "LayaLXFamework",
            version: "1.0.0",
            repository: "https://example.invalid/LayaLXFamework.git",
            managedPaths: [
                ".github/workflows/release-validation.yml",
                "framework.manifest.json",
            ],
        });
        write(legacyWorkflow, "name: Legacy release validation\n");
        git(source, "init");
        git(source, "config", "user.name", "Framework Test");
        git(source, "config", "user.email", "framework-test@example.invalid");
        git(source, "add", ".");
        git(source, "commit", "-m", "test: publish legacy workflow");
        git(source, "tag", "v1.0.0");

        run("sync", "--source", source, "--destination", destination, "--ref", "v1.0.0");
        expect(existsSync(join(destination, ".github", "workflows", "release-validation.yml"))).toBe(true);

        writeJson(manifestPath, {
            schemaVersion: 1,
            name: "LayaLXFamework",
            version: "1.1.0",
            repository: "https://example.invalid/LayaLXFamework.git",
            managedPaths: [
                ".github/workflows/framework-sync.yml",
                "framework.manifest.json",
            ],
        });
        rmSync(legacyWorkflow);
        write(syncWorkflow, "name: Framework sync contract\n");
        git(source, "add", ".");
        git(source, "commit", "-m", "test: replace validation workflows");
        git(source, "tag", "v1.1.0");

        run("sync", "--source", source, "--destination", destination, "--ref", "v1.1.0");
        expect(existsSync(join(destination, ".github", "workflows", "release-validation.yml"))).toBe(false);
        expect(readFileSync(join(destination, ".github", "workflows", "framework-sync.yml"), "utf8"))
            .toContain("Framework sync contract");
    }, distributionTestTimeoutMs);
});

function fixture(prefix: string): string {
    const root = mkdtempSync(join(tmpdir(), prefix));
    fixtureRoots.push(root);
    return root;
}

function git(cwd: string, ...args: string[]): void {
    execFileSync("git", args, { cwd, stdio: "ignore" });
}

function gitOutput(cwd: string, ...args: string[]): string {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
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
