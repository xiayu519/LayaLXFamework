import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const gameRoot = join(projectRoot, "src", "game");
const argumentsByName = parseArguments(process.argv.slice(2));
const id = argumentsByName.get("id");
const dryRun = argumentsByName.has("dry-run");
const reserved = new Set(["application", "bootstrap", "domain", "generated", "infrastructure", "platform", "presentation"]);

if (!id || !/^[a-z][a-z0-9-]*$/.test(id) || reserved.has(id)) {
    throw new Error("--id must be a non-reserved lowercase kebab-case game id.");
}
const target = resolve(gameRoot, id);
if (!target.startsWith(`${resolve(gameRoot)}${sep}`)) {
    throw new Error(`Game target escaped src/game: ${target}`);
}
if (!dryRun && existsSync(target)) {
    throw new Error(`Game directory already exists: src/game/${id}`);
}

const agents = renderAgents(id);
validateAgents(agents);
if (dryRun) {
    console.log(`Game workflow template OK: src/game/${id}/AGENTS.md layers over LayaProject/AGENTS.md.`);
} else {
    for (const directory of [
        target,
        join(target, ".agents", "skills"),
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
    console.log(`Game created: src/game/${id}`);
    console.log(`Start Codex with: codex --cd src/game/${id}`);
}

function parseArguments(args) {
    const result = new Map();
    for (let index = 0; index < args.length; index += 1) {
        const token = args[index];
        if (token === "--dry-run") {
            result.set("dry-run", true);
        } else if (token === "--id") {
            result.set("id", args[++index]);
        } else {
            throw new Error(`Unknown argument '${token}'.`);
        }
    }
    return result;
}

function renderAgents(gameId) {
    return `# ${gameId}\n\n`
        + "本文件只补充当前游戏规则。从本目录启动 Codex 时，AGENTS 按项目根到当前目录合并，因此 LayaProject/AGENTS.md 先于本文件生效；Skills 从当前目录向仓库根扫描，因此公共与游戏 Skills 同时可用。\n\n"
        + "游戏脚本以当前目录为边界。只在这里记录团队确认且跨任务稳定的玩法、平台、设计分辨率、资产和验收约束；不要复制公共框架规则，也不要写死 Skill 路由。\n\n"
        + "游戏专属 Skill 放在 `.agents/skills/`，使用独立名称和精确 description。公共能力候选先留在本游戏，证明跨游戏复用后再申请修改 `src/framework/`。\n";
}

function validateAgents(source) {
    if (Buffer.byteLength(source, "utf8") > 2048) {
        throw new Error("Generated game AGENTS.md exceeds 2048 bytes.");
    }
    if (/\$[a-z][a-z0-9-]*/.test(source)) {
        throw new Error("Generated game AGENTS.md must not hard-code Skill routing.");
    }
}
