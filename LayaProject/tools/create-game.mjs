import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const gameRoot = join(projectRoot, "src", "game");
const argumentsByName = parseArguments(process.argv.slice(2));
const id = argumentsByName.get("id");
const providedName = argumentsByName.get("name");
const name = providedName === undefined ? id : providedName.trim();
const dryRun = argumentsByName.has("dry-run");
const reserved = new Set(["application", "bootstrap", "domain", "generated", "infrastructure", "logic", "platform", "presentation"]);

if (!id || !/^[a-z][a-z0-9-]*$/.test(id) || reserved.has(id)) {
    throw new Error("--id must be a non-reserved English lowercase kebab-case game id; translate the user-provided business name before invoking this command.");
}
if (!name || name.length > 80 || /[\r\n\u0000-\u001f]/.test(name)) {
    throw new Error("--name must be a single-line business name of at most 80 characters.");
}
const target = resolve(gameRoot, id);
if (!target.startsWith(`${resolve(gameRoot)}${sep}`)) {
    throw new Error(`Game target escaped src/game: ${target}`);
}
if (!dryRun && existsSync(target)) {
    throw new Error(`Game directory already exists: src/game/${id}`);
}

const agents = renderAgents(id, name);
validateAgents(agents);
if (dryRun) {
    console.log(`Game workflow template OK: '${name}' -> src/game/${id}/AGENTS.md layers over LayaProject/AGENTS.md.`);
} else {
    for (const directory of [
        target,
        join(target, ".agents", "skills"),
        join(target, ".codex", "memory", "problems"),
        join(target, ".codex", "memory", "decisions"),
        join(target, ".codex", "memory", "feedback"),
        join(target, "application"),
        join(target, "bootstrap"),
        join(target, "domain"),
        join(target, "generated"),
        join(target, "infrastructure"),
        join(target, "platform"),
        join(target, "presentation"),
    ]) {
        mkdirSync(directory, { recursive: true });
    }
    writeFileSync(join(target, "AGENTS.md"), agents, { encoding: "utf8", flag: "wx" });
    writeFileSync(join(target, "AGENTS.md.meta"), metadataFor(`src/game/${id}/AGENTS.md`), {
        encoding: "utf8",
        flag: "wx",
    });
    writeFileSync(join(target, ".agents", "skills", "README.md"), renderSkillsReadme(id), {
        encoding: "utf8",
        flag: "wx",
    });
    writeFileSync(join(target, ".codex", "memory", "INDEX.md"), renderMemoryIndex(id), {
        encoding: "utf8",
        flag: "wx",
    });
    console.log(`Game created: '${name}' -> src/game/${id}`);
    console.log(`Start Codex with: codex --cd src/game/${id}`);
}

function parseArguments(args) {
    const result = new Map();
    for (let index = 0; index < args.length; index += 1) {
        const token = args[index];
        if (token === "--dry-run") {
            result.set("dry-run", true);
        } else if (token === "--id" || token === "--name") {
            const key = token.slice(2);
            const value = args[++index];
            if (!value || value.startsWith("--") || result.has(key)) {
                throw new Error(`${token} requires exactly one value.`);
            }
            result.set(key, value);
        } else {
            throw new Error(`Unknown argument '${token}'.`);
        }
    }
    return result;
}

function renderAgents(gameId, gameName) {
    return `# ${gameName}\n\nGame ID: \`${gameId}\`.\n\n`
        + "本文件只补充当前游戏规则。从本目录启动 Codex 时，AGENTS 按项目根到当前目录合并，因此 LayaProject/AGENTS.md 先于本文件生效；Skills 从当前目录向仓库根扫描，因此公共与游戏 Skills 同时可用。\n\n"
        + "游戏脚本以当前目录为边界；可调用 `src/game/logic/` 的公共业务逻辑，但不得把当前游戏代码写回 logic。只在这里记录团队确认且跨任务稳定的玩法、平台、设计分辨率、资产和验收约束；不要复制公共框架规则，也不要写死 Skill 路由。\n\n"
        + "游戏专属 Skill 放在 `.agents/skills/`，使用独立名称和精确 description；游戏经验写入本目录 `.codex/memory/`。公共能力候选先留在本游戏，证明跨游戏复用后再反馈上游。\n";
}

function renderSkillsReadme(gameId) {
    return `# ${gameId} Skills\n\n只在这里添加当前游戏专属 Skill；公共 Skill 保留在 LayaProject/.agents/skills。\n`;
}

function renderMemoryIndex(gameId) {
    return `# ${gameId} Memory\n\n## Problems\n\n## Decisions\n\n## Feedback\n`;
}

function metadataFor(identity) {
    const bytes = Buffer.from(createHash("sha256").update(`LXFamework:${identity}`).digest().subarray(0, 16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString("hex");
    const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    return `${JSON.stringify({ uuid }, undefined, 2)}\n`;
}

function validateAgents(source) {
    if (Buffer.byteLength(source, "utf8") > 2048) {
        throw new Error("Generated game AGENTS.md exceeds 2048 bytes.");
    }
    if (/\$[a-z][a-z0-9-]*/.test(source)) {
        throw new Error("Generated game AGENTS.md must not hard-code Skill routing.");
    }
}
