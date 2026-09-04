import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = resolve(skillRoot, "..", "..", "..");
const memoryRoot = join(projectRoot, ".codex", "memory");
const indexPath = join(memoryRoot, "INDEX.md");
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

function entryFiles() {
    const files = [];
    for (const folder of entryKinds.keys()) {
        const directory = join(memoryRoot, folder);
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

function parseEntry(path) {
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
    const title = source.match(/^#\s+(.+)$/m)?.[1] ?? portable(relative(memoryRoot, path));
    return { path, source, metadata, title, hasFrontmatter: Boolean(match) };
}

function check() {
    const errors = [];
    if (!existsSync(indexPath)) {
        errors.push("Missing .codex/memory/INDEX.md.");
    } else if (statSync(indexPath).size > 8192) {
        errors.push("Memory INDEX.md exceeds 8192 bytes.");
    }

    const indexSource = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "";
    for (const heading of ["## Problems", "## Decisions", "## Feedback"]) {
        if (!indexSource.includes(heading)) {
            errors.push(`Memory INDEX.md is missing '${heading}'.`);
        }
    }

    const linked = new Set();
    for (const match of indexSource.matchAll(/\[[^\]]+\]\(([^)]+\.md)\)/g)) {
        const target = resolve(memoryRoot, match[1]);
        linked.add(portable(relative(memoryRoot, target)));
        if (!existsSync(target)) {
            errors.push(`Memory index target does not exist: ${match[1]}`);
        }
    }

    for (const path of entryFiles()) {
        const entry = parseEntry(path);
        const relativePath = portable(relative(memoryRoot, path));
        if (statSync(path).size > 4096) {
            errors.push(`${relativePath} exceeds 4096 bytes.`);
        }
        if (!entry.hasFrontmatter) {
            errors.push(`${relativePath} is missing frontmatter.`);
            continue;
        }
        for (const field of requiredFields) {
            if (!entry.metadata[field]) {
                errors.push(`${relativePath} is missing '${field}'.`);
            }
        }
        const folder = relativePath.split("/", 1)[0];
        if (entry.metadata.type !== entryKinds.get(folder)) {
            errors.push(`${relativePath} type must be '${entryKinds.get(folder)}'.`);
        }
        if (!allowedStatuses.has(entry.metadata.status)) {
            errors.push(`${relativePath} has invalid status '${entry.metadata.status}'.`);
        }
        if (!allowedSources.has(entry.metadata.source)) {
            errors.push(`${relativePath} has invalid source '${entry.metadata.source}'.`);
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.metadata.last_verified ?? "")) {
            errors.push(`${relativePath} last_verified must use YYYY-MM-DD.`);
        }
        if ((entry.metadata.description ?? "").length > 180 || (entry.metadata.trigger ?? "").length > 180) {
            errors.push(`${relativePath} description/trigger exceeds 180 characters.`);
        }
        if (!linked.has(relativePath)) {
            errors.push(`${relativePath} is not linked from INDEX.md.`);
        }
    }

    if (errors.length > 0) {
        console.error("Project memory validation failed:");
        for (const error of errors) {
            console.error(`- ${error}`);
        }
        process.exitCode = 1;
        return;
    }
    console.log(`Project memory OK: ${entryFiles().length} indexed entries.`);
}

function search(rawArguments) {
    let limit = 3;
    const argumentsCopy = [...rawArguments];
    const limitIndex = argumentsCopy.indexOf("--limit");
    if (limitIndex >= 0) {
        limit = Number(argumentsCopy[limitIndex + 1]);
        argumentsCopy.splice(limitIndex, 2);
    }
    const terms = argumentsCopy.map((item) => item.trim().toLowerCase()).filter(Boolean);
    if (terms.length === 0 || !Number.isInteger(limit) || limit < 1 || limit > 10) {
        console.error("Usage: project-memory.mjs search <keyword...> [--limit 1..10]");
        process.exitCode = 2;
        return;
    }

    const matches = entryFiles()
        .map(parseEntry)
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
            `${portable(relative(projectRoot, entry.path))} | ${metadata.type} | ${metadata.scope} | ` +
            `${metadata.description} | trigger: ${metadata.trigger}`,
        );
    }
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
