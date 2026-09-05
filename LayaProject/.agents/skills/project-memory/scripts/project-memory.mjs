import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = resolve(skillRoot, "..", "..", "..");
const gameRoot = join(projectRoot, "src", "game");
const publicMemory = memoryAt(join(projectRoot, ".codex", "memory"));
const entryKinds = new Map([
    ["problems", "problem"],
    ["decisions", "decision"],
    ["feedback", "feedback"],
]);
const requiredFields = [
    "type",
    "scope",
    "description",
    "trigger",
    "status",
    "last_verified",
    "source",
];
const allowedStatuses = new Set(["active", "superseded", "archived"]);
const allowedSources = new Set(["user-confirmed", "code-verified", "external-verified"]);

function portable(path) {
    return path.split(sep).join("/");
}

function memoryAt(root) {
    return { root, indexPath: join(root, "INDEX.md") };
}

function gameMemories() {
    if (!existsSync(gameRoot)) {
        return [];
    }
    return readdirSync(gameRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => memoryAt(join(gameRoot, entry.name, ".codex", "memory")))
        .filter((memory) => existsSync(memory.root));
}

function activeMemories() {
    const local = relative(gameRoot, resolve(process.cwd()));
    const segments = local.split(sep);
    const insideGame = local !== ""
        && local !== ".."
        && !local.startsWith(`..${sep}`)
        && !isAbsolute(local);
    if (!insideGame || !segments[0]) {
        return [publicMemory];
    }
    const gameMemory = memoryAt(join(gameRoot, segments[0], ".codex", "memory"));
    return existsSync(gameMemory.root) ? [publicMemory, gameMemory] : [publicMemory];
}

function entryFiles(memory) {
    const files = [];
    for (const folder of entryKinds.keys()) {
        const directory = join(memory.root, folder);
        if (!existsSync(directory)) {
            continue;
        }
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            if (entry.isFile() && entry.name.endsWith(".md")) {
                files.push(join(directory, entry.name));
            }
        }
    }
    return files.sort();
}

function parseEntry(memory, path) {
    const source = readFileSync(path, "utf8");
    const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const metadata = {};
    if (match) {
        for (const line of match[1].split(/\r?\n/)) {
            const separator = line.indexOf(":");
            if (separator > 0) {
                metadata[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
            }
        }
    }
    const title = source.match(/^#\s+(.+)$/m)?.[1] ?? portable(relative(memory.root, path));
    return { path, source, metadata, title, hasFrontmatter: Boolean(match) };
}

function checkMemory(memory) {
    const errors = [];
    const localRoot = portable(relative(projectRoot, memory.root));
    if (!existsSync(memory.indexPath)) {
        errors.push(`${localRoot}/INDEX.md is missing.`);
        return { errors, count: 0 };
    }
    if (statSync(memory.indexPath).size > 8192) {
        errors.push(`${localRoot}/INDEX.md exceeds 8192 bytes.`);
    }

    const indexSource = readFileSync(memory.indexPath, "utf8");
    for (const heading of ["## Problems", "## Decisions", "## Feedback"]) {
        if (!indexSource.includes(heading)) {
            errors.push(`${localRoot}/INDEX.md is missing '${heading}'.`);
        }
    }

    const linked = new Set();
    for (const match of indexSource.matchAll(/\[[^\]]+\]\(([^)]+\.md)\)/g)) {
        const target = resolve(memory.root, match[1]);
        linked.add(portable(relative(memory.root, target)));
        if (!existsSync(target)) {
            errors.push(`${localRoot}/INDEX.md target does not exist: ${match[1]}`);
        }
    }

    const files = entryFiles(memory);
    for (const path of files) {
        const entry = parseEntry(memory, path);
        const relativePath = portable(relative(memory.root, path));
        const displayPath = `${localRoot}/${relativePath}`;
        if (statSync(path).size > 4096) {
            errors.push(`${displayPath} exceeds 4096 bytes.`);
        }
        if (!entry.hasFrontmatter) {
            errors.push(`${displayPath} is missing frontmatter.`);
            continue;
        }
        for (const field of requiredFields) {
            if (!entry.metadata[field]) {
                errors.push(`${displayPath} is missing '${field}'.`);
            }
        }
        const folder = relativePath.split("/", 1)[0];
        if (entry.metadata.type !== entryKinds.get(folder)) {
            errors.push(`${displayPath} type must be '${entryKinds.get(folder)}'.`);
        }
        if (!allowedStatuses.has(entry.metadata.status)) {
            errors.push(`${displayPath} has invalid status '${entry.metadata.status}'.`);
        }
        if (!allowedSources.has(entry.metadata.source)) {
            errors.push(`${displayPath} has invalid source '${entry.metadata.source}'.`);
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.metadata.last_verified ?? "")) {
            errors.push(`${displayPath} last_verified must use YYYY-MM-DD.`);
        }
        if ((entry.metadata.description ?? "").length > 180 || (entry.metadata.trigger ?? "").length > 180) {
            errors.push(`${displayPath} description/trigger exceeds 180 characters.`);
        }
        if (!linked.has(relativePath)) {
            errors.push(`${displayPath} is not linked from INDEX.md.`);
        }
    }
    return { errors, count: files.length };
}

function check() {
    const memories = [publicMemory, ...gameMemories()];
    const results = memories.map(checkMemory);
    const errors = results.flatMap((result) => result.errors);
    if (errors.length > 0) {
        console.error("Project memory validation failed:");
        for (const error of errors) {
            console.error(`- ${error}`);
        }
        process.exitCode = 1;
        return;
    }
    const count = results.reduce((total, result) => total + result.count, 0);
    console.log(`Project memory OK: ${count} indexed entries across ${memories.length} scope(s).`);
}

function search(rawArguments) {
    let limit = 3;
    const argumentsCopy = [...rawArguments];
    const limitIndex = argumentsCopy.indexOf("--limit");
    if (limitIndex >= 0) {
        limit = Number(argumentsCopy[limitIndex + 1]);
        argumentsCopy.splice(limitIndex, 2);
    }
    const terms = [...new Set(argumentsCopy.flatMap(tokenize))];
    if (terms.length === 0 || !Number.isInteger(limit) || limit < 1 || limit > 10) {
        console.error("Usage: project-memory.mjs search <keyword...> [--limit 1..10]");
        process.exitCode = 2;
        return;
    }

    const matches = activeMemories()
        .flatMap((memory) => entryFiles(memory).map((path) => parseEntry(memory, path)))
        .map((entry) => {
            const metadata = entry.metadata;
            const fields = [metadata.scope, metadata.description, metadata.trigger, entry.title, entry.source]
                .filter(Boolean)
                .map((item) => item.toLowerCase());
            const body = entry.source.toLowerCase();
            const score = terms.reduce((total, term) => {
                const fieldHits = fields.reduce((count, item) => count + (item.includes(term) ? 3 : 0), 0);
                return total + fieldHits + (body.includes(term) ? 1 : 0);
            }, 0) + (metadata.status === "active" ? 1 : 0);
            return { entry, score };
        })
        .filter((item) => item.score > 1)
        .sort((left, right) => right.score - left.score || left.entry.path.localeCompare(right.entry.path))
        .slice(0, limit);

    if (matches.length === 0) {
        console.log("No project memory matched.");
        return;
    }
    for (const { entry } of matches) {
        const metadata = entry.metadata;
        console.log(
            `${portable(relative(projectRoot, entry.path))} | ${metadata.type} | ${metadata.scope} | `
            + `${metadata.description} | trigger: ${metadata.trigger}`,
        );
    }
}

function tokenize(value) {
    return value.normalize("NFKC").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

const command = process.argv[2];
if (command === "check") {
    check();
} else if (command === "search") {
    search(process.argv.slice(3));
} else {
    console.error("Usage: project-memory.mjs <check|search>");
    process.exitCode = 2;
}
