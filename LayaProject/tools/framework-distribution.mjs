import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    chmodSync,
    copyFileSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultRepositoryRoot = resolve(projectRoot, "..");
const semverTagPattern = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const command = process.argv[2] ?? "check";
const options = parseOptions(process.argv.slice(3));
const destinationRoot = resolve(options.get("destination") ?? defaultRepositoryRoot);

if (command === "manifest") {
    const manifest = readManifest(destinationRoot);
    const files = expandManagedFiles(destinationRoot, manifest);
    validateJsonContracts(destinationRoot, manifest);
    console.log(`Framework manifest OK: ${files.length} managed file(s), ${Object.keys(manifest.jsonContracts ?? {}).length} JSON contract(s).`);
} else if (command === "check") {
    checkIntegrity(destinationRoot);
} else if (command === "upstream") {
    await verifyUpstream(destinationRoot, options);
} else if (command === "sync") {
    await syncFramework(destinationRoot, options);
} else {
    throw new Error("Usage: framework-distribution.mjs <manifest|check|upstream|sync> [--source <path> | --repository <url>] (--ref <tag> | --channel <branch>) [--destination <path>]");
}

async function verifyUpstream(root, parsed) {
    const lockPath = join(root, ".framework-lock.json");
    if (!existsSync(lockPath)) {
        console.log("Framework upstream verification skipped: this is the unlocked source repository.");
        return;
    }
    const lock = readConsumerLock(lockPath);
    let sourceRoot;
    let temporaryClone;
    try {
        if (parsed.has("source")) {
            const localSource = resolve(parsed.get("source"));
            verifyLockedReference(localSource, lock.source, lock.commit);
            temporaryClone = mkdtempSync(join(resolve(tmpdir()), "lx-framework-upstream-"));
            sourceRoot = join(temporaryClone, "source");
            runGit(["-c", "core.autocrlf=false", "clone", "--no-checkout", "--local", "--", localSource, sourceRoot]);
            runGit(["-c", "core.autocrlf=false", "-C", sourceRoot, "checkout", "--detach", lock.commit]);
        } else {
            const repository = parsed.get("repository") ?? lock.repository;
            temporaryClone = mkdtempSync(join(resolve(tmpdir()), "lx-framework-upstream-"));
            sourceRoot = join(temporaryClone, "source");
            if (lock.source.mode === "release") {
                runGit(["-c", "core.autocrlf=false", "clone", "--depth", "1", "--branch", lock.source.ref, "--", repository, sourceRoot]);
                verifyClonedReference(sourceRoot, lock.source, lock.commit);
            } else {
                runGit(["-c", "core.autocrlf=false", "clone", "--filter=blob:none", "--single-branch", "--branch", lock.source.ref, "--", repository, sourceRoot]);
                if (!gitSucceeds(sourceRoot, ["merge-base", "--is-ancestor", lock.commit, `origin/${lock.source.ref}`])) {
                    throw new Error(`Locked commit '${lock.commit}' is no longer reachable from channel '${lock.source.ref}'.`);
                }
                runGit(["-c", "core.autocrlf=false", "-C", sourceRoot, "checkout", "--detach", lock.commit]);
            }
        }
        const sourceCommit = gitValue(sourceRoot, ["rev-parse", "HEAD"]);
        const manifest = readManifest(sourceRoot);
        const sourceFiles = expandManagedFiles(sourceRoot, manifest);
        const locked = new Map((lock.files ?? []).map((entry) => [entry.path, entry]));
        const failures = [];
        if (manifest.version !== lock.manifestVersion) {
            failures.push(`manifest version ${lock.manifestVersion} does not match upstream ${manifest.version}`);
        }
        if (lock.source.mode === "release" && `v${manifest.version}` !== lock.source.ref) {
            failures.push(`release ${lock.source.ref} does not match upstream manifest v${manifest.version}`);
        }
        if (sourceCommit !== lock.commit) {
            failures.push(`commit ${lock.commit} does not match upstream ${sourceCommit ?? "unknown"}`);
        }
        if (hashFile(join(sourceRoot, "framework.manifest.json")) !== lock.manifestHash) {
            failures.push("manifest hash does not match the locked upstream commit");
        }
        for (const path of sourceFiles) {
            const expected = locked.get(path);
            const source = safeResolve(sourceRoot, path);
            if (!expected) {
                failures.push(`lock is missing upstream file ${path}`);
            } else if (expected.sha256 !== hashFile(source) || expected.size !== statSync(source).size) {
                failures.push(`lock hash differs from upstream file ${path}`);
            }
            locked.delete(path);
        }
        for (const path of locked.keys()) {
            failures.push(`lock contains non-upstream file ${path}`);
        }
        if (failures.length > 0) {
            throw new Error(`Framework upstream verification failed:\n- ${failures.join("\n- ")}`);
        }
        console.log(`Framework upstream OK: ${formatLockSource(lock)} (${lock.commit}), ${sourceFiles.length} managed file(s).`);
    } finally {
        if (temporaryClone && dirname(temporaryClone) === resolve(tmpdir())) {
            rmSync(temporaryClone, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        }
    }
}

function parseOptions(args) {
    const parsed = new Map();
    for (let index = 0; index < args.length; index += 2) {
        const key = args[index];
        const value = args[index + 1];
        if (!["--source", "--repository", "--ref", "--channel", "--destination"].includes(key) || !value) {
            throw new Error(`Invalid framework distribution option '${key ?? ""}'.`);
        }
        if (parsed.has(key.slice(2))) {
            throw new Error(`Duplicate framework distribution option '${key}'.`);
        }
        parsed.set(key.slice(2), value);
    }
    return parsed;
}

function readManifest(root) {
    const path = join(root, "framework.manifest.json");
    const manifest = readJson(path);
    if (manifest?.schemaVersion !== 1
        || manifest?.name !== "LayaLXFamework"
        || typeof manifest?.version !== "string"
        || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version)
        || typeof manifest?.repository !== "string"
        || !Array.isArray(manifest?.managedPaths)
        || manifest.managedPaths.length === 0
        || new Set(manifest.managedPaths).size !== manifest.managedPaths.length
        || manifest.managedPaths.some((path) => typeof path !== "string" || !isSafeRelative(path))
        || (manifest.jsonContracts !== undefined
            && (!manifest.jsonContracts || typeof manifest.jsonContracts !== "object" || Array.isArray(manifest.jsonContracts)))) {
        throw new Error("framework.manifest.json has an invalid distribution contract.");
    }
    const forbidden = [
        "Design/Tables",
        "LayaProject/assets/bootstrap/game",
        "LayaProject/assets/packages",
        "LayaProject/assets/shared",
        "LayaProject/src/game",
        "LayaProject/tests/game",
        "LayaProject/settings/GameProject.json",
        "LayaProject/settings/HeadlessValidation.json",
        ".framework-lock.json",
    ];
    for (const entry of manifest.managedPaths) {
        const base = entry.endsWith("/**") ? entry.slice(0, -3) : entry;
        if (forbidden.some((path) => base === path || base.startsWith(`${path}/`))) {
            throw new Error(`framework.manifest.json manages downstream-owned path '${entry}'.`);
        }
    }
    return manifest;
}

function expandManagedFiles(root, manifest) {
    const files = new Set();
    for (const entry of manifest.managedPaths) {
        if (entry.endsWith("/**")) {
            const directory = safeResolve(root, entry.slice(0, -3));
            if (!existsSync(directory) || !statSync(directory).isDirectory()) {
                throw new Error(`Managed directory is missing: ${entry.slice(0, -3)}`);
            }
            for (const path of walkFiles(directory)) {
                files.add(portable(relative(root, path)));
            }
        } else {
            const path = safeResolve(root, entry);
            if (!existsSync(path) || !statSync(path).isFile()) {
                throw new Error(`Managed file is missing: ${entry}`);
            }
            files.add(portable(relative(root, path)));
        }
    }
    return [...files].sort();
}

function checkIntegrity(root) {
    const manifest = readManifest(root);
    const lockPath = join(root, ".framework-lock.json");
    validateJsonContracts(root, manifest);
    if (!existsSync(lockPath)) {
        const files = expandManagedFiles(root, manifest);
        console.log(`Framework source OK: ${files.length} managed file(s); no consumer lock is present.`);
        return;
    }

    const lock = readConsumerLock(lockPath);
    const failures = [];
    const manifestHash = hashFile(join(root, "framework.manifest.json"));
    if (manifestHash !== lock.manifestHash) {
        failures.push("framework.manifest.json differs from the locked upstream manifest");
    }
    const locked = new Map(lock.files.map((entry) => [entry.path, entry]));
    const current = new Set(expandManagedFiles(root, manifest));
    for (const [path, expected] of locked) {
        const target = safeResolve(root, path);
        if (!existsSync(target)) {
            failures.push(`missing ${path}`);
        } else if (hashFile(target) !== expected.sha256 || statSync(target).size !== expected.size) {
            failures.push(`changed ${path}`);
        }
        current.delete(path);
    }
    for (const path of current) {
        failures.push(`unlocked ${path}`);
    }
    if (failures.length > 0) {
        throw new Error(`Framework integrity check failed:\n- ${failures.join("\n- ")}\nRun the approved framework sync command; do not patch managed files downstream.`);
    }
    console.log(`Framework integrity OK: ${formatLockSource(lock)} (${lock.commit}), ${lock.files.length} managed file(s).`);
}

async function syncFramework(root, parsed) {
    if (parsed.has("source") && parsed.has("repository")) {
        throw new Error("Use either --source or --repository, not both.");
    }
    const reference = parsed.get("ref");
    const channel = parsed.get("channel");
    if ((reference ? 1 : 0) + (channel ? 1 : 0) !== 1) {
        throw new Error("Framework sync requires exactly one of --ref <tag> or --channel <branch>.");
    }
    if (reference && !semverTagPattern.test(reference)) {
        throw new Error("Framework --ref must be an immutable SemVer Tag such as v0.2.0.");
    }
    if (channel) {
        validateChannel(channel);
    }
    const lockSource = reference
        ? { mode: "release", ref: reference }
        : { mode: "snapshot", ref: channel };
    let sourceRoot;
    let temporaryClone;
    try {
        if (parsed.has("source")) {
            const localSource = resolve(parsed.get("source"));
            if (localSource === resolve(root)) {
                throw new Error("Framework sync source and destination must be different repositories.");
            }
            verifyLocalReference(localSource, lockSource);
            temporaryClone = mkdtempSync(join(resolve(tmpdir()), "lx-framework-sync-"));
            sourceRoot = join(temporaryClone, "source");
            runGit(["-c", "core.autocrlf=false", "clone", "--no-checkout", "--local", "--", localSource, sourceRoot]);
            runGit(["-c", "core.autocrlf=false", "-C", sourceRoot, "checkout", "--detach", localReference(lockSource)]);
        } else {
            const repository = parsed.get("repository") ?? readExistingRepository(root);
            temporaryClone = mkdtempSync(join(resolve(tmpdir()), "lx-framework-sync-"));
            sourceRoot = join(temporaryClone, "source");
            runGit(["-c", "core.autocrlf=false", "clone", "--depth", "1", "--branch", lockSource.ref, "--", repository, sourceRoot]);
            verifyClonedReference(sourceRoot, lockSource);
        }

        if (resolve(sourceRoot) === resolve(root)) {
            throw new Error("Framework sync source and destination must be different repositories.");
        }
        const manifest = readManifest(sourceRoot);
        if (reference?.startsWith("v") && reference.slice(1) !== manifest.version) {
            throw new Error(`Framework ref '${reference}' does not match manifest version '${manifest.version}'.`);
        }
        const sourceFiles = expandManagedFiles(sourceRoot, manifest);
        const oldLockPath = join(root, ".framework-lock.json");
        const oldLock = existsSync(oldLockPath) ? readJson(oldLockPath) : undefined;
        const nextFiles = new Set(sourceFiles);
        for (const entry of oldLock?.files ?? []) {
            if (!nextFiles.has(entry.path)) {
                const stale = safeResolve(root, entry.path);
                if (existsSync(stale) && statSync(stale).isFile()) {
                    rmSync(stale);
                }
            }
        }
        removeDestinationExtras(root, manifest, nextFiles);
        for (const local of sourceFiles) {
            const source = safeResolve(sourceRoot, local);
            const destination = safeResolve(root, local);
            mkdirSync(dirname(destination), { recursive: true });
            copyFileSync(source, destination);
            chmodSync(destination, statSync(source).mode & 0o777);
        }
        applyJsonContracts(root, manifest);

        const sourceCommit = gitValue(sourceRoot, ["rev-parse", "HEAD"]) ?? "working-tree";
        const files = sourceFiles.map((path) => {
            const target = safeResolve(root, path);
            return { path, sha256: hashFile(target), size: statSync(target).size };
        });
        const lock = {
            schemaVersion: 2,
            repository: manifest.repository,
            source: lockSource,
            commit: sourceCommit,
            manifestVersion: manifest.version,
            manifestHash: hashFile(join(root, "framework.manifest.json")),
            files,
        };
        writeJson(join(root, ".framework-lock.json"), lock);
        checkIntegrity(root);
        console.log(`Framework sync OK: ${formatLockSource(lock)} (${sourceCommit}).`);
    } finally {
        if (temporaryClone && dirname(temporaryClone) === resolve(tmpdir())) {
            rmSync(temporaryClone, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        }
    }
}

function removeDestinationExtras(root, manifest, expectedFiles) {
    for (const entry of manifest.managedPaths) {
        if (!entry.endsWith("/**")) {
            continue;
        }
        const directory = safeResolve(root, entry.slice(0, -3));
        if (!existsSync(directory)) {
            continue;
        }
        for (const path of walkFiles(directory)) {
            const local = portable(relative(root, path));
            if (!expectedFiles.has(local)) {
                rmSync(path);
            }
        }
    }
}

function validateJsonContracts(root, manifest) {
    const failures = [];
    for (const [local, expected] of Object.entries(manifest.jsonContracts ?? {})) {
        if (!isSafeRelative(local)) {
            throw new Error(`Unsafe JSON contract path '${local}'.`);
        }
        const path = safeResolve(root, local);
        if (!existsSync(path)) {
            failures.push(`missing ${local}`);
            continue;
        }
        collectContractDifferences(expected, readJson(path), local, failures);
    }
    if (failures.length > 0) {
        throw new Error(`Framework JSON contract check failed:\n- ${failures.join("\n- ")}`);
    }
}

function collectContractDifferences(expected, actual, label, failures) {
    if (Array.isArray(expected) || expected === null || typeof expected !== "object") {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            failures.push(`${label} must equal ${JSON.stringify(expected)}`);
        }
        return;
    }
    for (const [key, value] of Object.entries(expected)) {
        if (!actual || typeof actual !== "object" || !(key in actual)) {
            failures.push(`${label}.${key} is missing`);
        } else {
            collectContractDifferences(value, actual[key], `${label}.${key}`, failures);
        }
    }
}

function applyJsonContracts(root, manifest) {
    for (const [local, contract] of Object.entries(manifest.jsonContracts ?? {})) {
        const path = safeResolve(root, local);
        const current = existsSync(path) ? readJson(path) : {};
        const merged = mergeContract(current, contract);
        mkdirSync(dirname(path), { recursive: true });
        writeJson(path, merged);
    }
}

function mergeContract(current, contract) {
    if (Array.isArray(contract) || contract === null || typeof contract !== "object") {
        return contract;
    }
    const result = current && typeof current === "object" && !Array.isArray(current) ? { ...current } : {};
    for (const [key, value] of Object.entries(contract)) {
        result[key] = mergeContract(result[key], value);
    }
    return result;
}

function readExistingRepository(root) {
    const lockPath = join(root, ".framework-lock.json");
    if (existsSync(lockPath)) {
        const repository = readJson(lockPath).repository;
        if (typeof repository === "string" && repository.length > 0) {
            return repository;
        }
    }
    const manifestPath = join(root, "framework.manifest.json");
    if (existsSync(manifestPath)) {
        return readManifest(root).repository;
    }
    throw new Error("No framework repository is configured; pass --repository <url>.");
}

function verifyLocalReference(root, source) {
    const head = gitValue(root, ["rev-parse", "HEAD"]);
    const expected = gitValue(root, ["rev-parse", `${localReference(source)}^{commit}`]);
    if (!head || !expected || head !== expected) {
        throw new Error(`Local framework source HEAD does not match ${source.mode} '${source.ref}'.`);
    }
    if (gitValue(root, ["status", "--porcelain"])) {
        throw new Error("Local framework source has uncommitted changes; sync only a clean selected reference.");
    }
}

function verifyLockedReference(root, source, commit) {
    const expected = gitValue(root, ["rev-parse", `${localReference(source)}^{commit}`]);
    if (!expected) {
        throw new Error(`Local framework source does not contain '${source.ref}'.`);
    }
    if (source.mode === "release" && expected !== commit) {
        throw new Error(`Release '${source.ref}' does not point to locked commit '${commit}'.`);
    }
    if (source.mode === "snapshot" && !gitSucceeds(root, ["merge-base", "--is-ancestor", commit, localReference(source)])) {
        throw new Error(`Locked commit '${commit}' is no longer reachable from channel '${source.ref}'.`);
    }
}

function verifyClonedReference(root, source, expectedCommit) {
    const reference = source.mode === "release"
        ? `refs/tags/${source.ref}`
        : `refs/remotes/origin/${source.ref}`;
    const resolved = gitValue(root, ["rev-parse", `${reference}^{commit}`]);
    const head = gitValue(root, ["rev-parse", "HEAD"]);
    if (!resolved || resolved !== head || (expectedCommit && resolved !== expectedCommit)) {
        throw new Error(`Cloned framework source does not match ${source.mode} '${source.ref}'.`);
    }
}

function localReference(source) {
    return source.mode === "release"
        ? `refs/tags/${source.ref}`
        : `refs/heads/${source.ref}`;
}

function validateChannel(channel) {
    if (channel.startsWith("-") || !gitSucceeds(undefined, ["check-ref-format", "--branch", channel])) {
        throw new Error(`Invalid framework channel '${channel}'.`);
    }
}

function readConsumerLock(path) {
    const lock = readJson(path);
    if (!hasValidLockFiles(lock)
        || typeof lock.repository !== "string"
        || typeof lock.commit !== "string"
        || typeof lock.manifestHash !== "string") {
        throw new Error(".framework-lock.json has an invalid lock contract.");
    }
    if (lock.schemaVersion === 1 && semverTagPattern.test(lock.version ?? "")) {
        return {
            ...lock,
            source: { mode: "release", ref: lock.version },
            manifestVersion: lock.version.slice(1),
        };
    }
    if (lock.schemaVersion === 2
        && (lock.source?.mode === "release" || lock.source?.mode === "snapshot")
        && typeof lock.source.ref === "string"
        && typeof lock.manifestVersion === "string"
        && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(lock.manifestVersion)
        && ((lock.source.mode === "release" && semverTagPattern.test(lock.source.ref))
            || (lock.source.mode === "snapshot" && isValidChannel(lock.source.ref)))) {
        return lock;
    }
    throw new Error(".framework-lock.json has an invalid lock contract.");
}

function hasValidLockFiles(lock) {
    return Array.isArray(lock?.files)
        && lock.files.every((entry) => entry
            && typeof entry.path === "string"
            && typeof entry.sha256 === "string"
            && typeof entry.size === "number")
        && new Set(lock.files.map((entry) => entry.path)).size === lock.files.length;
}

function isValidChannel(channel) {
    return typeof channel === "string"
        && !channel.startsWith("-")
        && gitSucceeds(undefined, ["check-ref-format", "--branch", channel]);
}

function formatLockSource(lock) {
    return lock.source.mode === "release"
        ? lock.source.ref
        : `${lock.source.ref} snapshot`;
}

function gitValue(root, args) {
    const gitArgs = root ? ["-C", root, ...args] : args;
    const result = spawnSync("git", gitArgs, { encoding: "utf8", windowsHide: true });
    return result.status === 0 ? result.stdout.trim() : undefined;
}

function gitSucceeds(root, args) {
    const gitArgs = root ? ["-C", root, ...args] : args;
    return spawnSync("git", gitArgs, { encoding: "utf8", windowsHide: true }).status === 0;
}

function runGit(args) {
    const result = spawnSync("git", args, { encoding: "utf8", windowsHide: true });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`git ${args[0]} failed: ${(result.stderr || result.stdout).trim()}`);
    }
}

function walkFiles(root) {
    const files = [];
    for (const entry of readdirSync(root, { withFileTypes: true })) {
        const path = join(root, entry.name);
        if (entry.isDirectory()) {
            files.push(...walkFiles(path));
        } else if (entry.isFile()) {
            files.push(path);
        }
    }
    return files;
}

function safeResolve(root, local) {
    if (!isSafeRelative(local)) {
        throw new Error(`Unsafe framework path '${local}'.`);
    }
    const path = resolve(root, local);
    if (!path.startsWith(`${resolve(root)}${sep}`)) {
        throw new Error(`Framework path escaped repository: ${local}`);
    }
    return path;
}

function isSafeRelative(path) {
    if (typeof path !== "string" || path.length === 0 || isAbsolute(path) || path.includes("\\")) {
        return false;
    }
    const local = path.endsWith("/**") ? path.slice(0, -3) : path;
    return local.split("/").every((segment) => segment !== ""
        && segment !== "."
        && segment !== ".."
        && segment !== ".git");
}

function hashFile(path) {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readJson(path) {
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
        throw new Error(`Cannot read JSON '${path}': ${error.message}`);
    }
}

function writeJson(path, value) {
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function portable(path) {
    return path.split(sep).join("/");
}
