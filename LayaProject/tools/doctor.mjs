import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { LAYA_VERSION, resolveLayaRuntime } from "./layaair.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const defaultIdeRoot = "D:\\Soft\\Laya\\LayaAirIDE";
const ideRoot = process.env.LAYAAIR_IDE_HOME
    ? resolve(process.env.LAYAAIR_IDE_HOME)
    : (existsSync(defaultIdeRoot) ? defaultIdeRoot : undefined);
let verifiedIdeRoot;

function readJson(path) {
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
        errors.push(`Cannot parse ${relative(projectRoot, path)}: ${error.message}`);
        return {};
    }
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 20) {
    errors.push(`Node.js 20+ is required; found ${process.versions.node}.`);
}

const dotnetVersion = spawnSync("dotnet", ["--version"], { encoding: "utf8", windowsHide: true });
if (dotnetVersion.error || dotnetVersion.status !== 0) {
    errors.push(".NET 8+ is required to run the pinned Luban generator.");
} else if (Number((dotnetVersion.stdout ?? "").trim().split(".")[0]) < 8) {
    errors.push(`.NET 8+ is required; found '${dotnetVersion.stdout.trim()}'.`);
}

const designToolRoot = resolve(projectRoot, "..", "Design", "tools");
const lubanDll = join(designToolRoot, "Luban", "Luban.dll");
const lubanVersionPath = join(designToolRoot, "LUBAN_VERSION");
if (existsSync(lubanDll) && existsSync(lubanVersionPath)) {
    const expectedLuban = readFileSync(lubanVersionPath, "utf8").trim();
    const result = spawnSync("dotnet", [lubanDll, "--version"], {
        cwd: designToolRoot,
        encoding: "utf8",
        windowsHide: true,
    });
    const actualLuban = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().replace(/^Luban\s+/, "");
    if (result.error || actualLuban !== expectedLuban) {
        errors.push(`Pinned Luban '${expectedLuban}' is not runnable; found '${actualLuban || "unknown"}'.`);
    }
}

const projectInfo = readJson(join(projectRoot, "LayaProject.laya"));
if (projectInfo.version !== LAYA_VERSION) {
    errors.push(`LayaProject.laya must pin ${LAYA_VERSION}; found '${projectInfo.version}'.`);
}

const player = readJson(join(projectRoot, "settings", "PlayerSettings.json"));
if (player.addons?.["laya.ui"] !== "ui2" || player.modules?.["laya.ui"] !== true) {
    errors.push("PlayerSettings must enable laya.ui with the ui2 addon.");
}
if (player.modules?.["laya.d3"] !== false) {
    errors.push("PlayerSettings must explicitly disable laya.d3 for this 2D foundation.");
}
if (player.modules?.["laya.spine"] !== true) {
    errors.push("PlayerSettings must enable laya.spine for Spine2DRenderNode support.");
}

const build = readJson(join(projectRoot, "settings", "BuildSettings.json"));
const resourceLayout = readJson(join(projectRoot, "settings", "ResourceLayout.json"));
const startupUuid = typeof build.startupScene === "string" && build.startupScene.startsWith("res://")
    ? build.startupScene.slice("res://".length)
    : "";
const startupScene = typeof resourceLayout.startupScene === "string" ? resourceLayout.startupScene : "__invalid__.ls";
const sceneMeta = readJson(join(projectRoot, "assets", `${startupScene}.meta`));
if (!startupUuid || sceneMeta.uuid !== startupUuid) {
    errors.push("BuildSettings startupScene does not resolve to ResourceLayout.startupScene.");
}

const scene = readJson(join(projectRoot, "assets", startupScene));
const mainMeta = readJson(join(projectRoot, "src", "Main.ts.meta"));
const mainComponent = scene._$comp?.find((component) => component._$type === mainMeta.uuid);
if (!mainComponent || resolve(dirname(join(projectRoot, "assets", startupScene)), mainComponent.scriptPath) !== join(projectRoot, "src", "Main.ts")) {
    errors.push("ResourceLayout.startupScene must attach src/Main.ts using its meta uuid and a resolving relative path.");
}

const typescriptPackage = readJson(join(projectRoot, "node_modules", "typescript", "package.json"));
if (typescriptPackage.version !== "5.9.3") {
    errors.push(`Project TypeScript must be 5.9.3; found '${typescriptPackage.version}'.`);
}

try {
    const runtime = resolveLayaRuntime();
    const engine = readJson(join(runtime.runtimeRoot, "Resources", "engine.json"));
    const coreLib = join(runtime.runtimeRoot, "Resources", "engine", "libs", "laya.core.js");
    const webgl2DLib = join(runtime.runtimeRoot, "Resources", "engine", "libs", "laya.webgl_2D.js");
    const spineLib = join(runtime.runtimeRoot, "Resources", "engine", "libs", "laya.spine.js");
    if (!existsSync(coreLib) || !existsSync(webgl2DLib) || !existsSync(spineLib)) {
        errors.push("Installed CLI runtime is missing core, WebGL 2D or Spine engine libraries.");
    }
    if (engine.version && engine.version !== LAYA_VERSION) {
        errors.push(`Installed CLI engine version is '${engine.version}', expected '${LAYA_VERSION}'.`);
    }
    if (existsSync(coreLib)) {
        const coreSource = readFileSync(coreLib, "utf8");
        if (!coreSource.includes(`LayaEnv.version = "${LAYA_VERSION}"`)) {
            errors.push(`Installed CLI core library does not declare LayaAir ${LAYA_VERSION}.`);
        }
    }
    if (ideRoot) {
        const ideExecutable = join(ideRoot, "LayaAirIDE.exe");
        const ideCoreLib = join(ideRoot, "resources", "engine", "libs", "laya.core.js");
        const ideTypes = join(ideRoot, "resources", "engine", "types", "LayaAir.d.ts");
        const cliTypes = join(runtime.runtimeRoot, "Resources", "engine", "types", "LayaAir.d.ts");
        const projectTypes = join(projectRoot, "engine", "types", "LayaAir.d.ts");
        if (!existsSync(ideExecutable) || !existsSync(ideCoreLib) || !existsSync(ideTypes)) {
            errors.push(`LayaAir IDE installation is incomplete: ${ideRoot}.`);
        } else {
            const ideCoreSource = readFileSync(ideCoreLib, "utf8");
            if (!ideCoreSource.includes(`LayaEnv.version = "${LAYA_VERSION}"`)) {
                errors.push(`LayaAir IDE core library is not version ${LAYA_VERSION}: ${ideRoot}.`);
            }
            const expectedTypes = readFileSync(projectTypes);
            if (!expectedTypes.equals(readFileSync(ideTypes)) || !expectedTypes.equals(readFileSync(cliTypes))) {
                errors.push("Project, IDE and CLI LayaAir.d.ts files do not match byte-for-byte.");
            } else {
                verifiedIdeRoot = ideRoot;
            }
        }
    }
} catch (error) {
    errors.push(error.message);
}

const requiredPaths = [
    "AGENTS.md",
    ".codex/config.toml",
    ".agents/skills/codex-workflow/SKILL.md",
    ".agents/skills/project-memory/SKILL.md",
    ".agents/skills/sdd-explore/SKILL.md",
    ".codex/memory/INDEX.md",
    "settings/ResourceLayout.json",
    "settings/PerformanceBudgets.json",
    "settings/LayaSourceBaseline.json",
    "assets/bootstrap/scenes/Startup.ls",
    "assets/bootstrap/ui/FrameworkStatus.lh",
    "src/framework/LX.ts",
    "src/framework/bootstrap/AppBootstrap.ts",
    "src/game/bootstrap/createApplication.ts",
    "tools/test-headless.mjs",
    "tools/check-engine-source.mjs",
    "tools/luban.mjs",
    "tools/validate-resource-layout.mjs",
    ".agents/skills/laya-minigame-packaging/SKILL.md",
    ".agents/skills/laya-json-data/SKILL.md",
    ".agents/skills/luban-tables/SKILL.md",
    "src/game/generated/luban/ByteBuf.ts",
    "assets/bootstrap/tables/game/tbtableappconfig.bin",
    "assets/bootstrap/config/runtime.json",
    "assets/bootstrap/ui/common/Tip.lh",
    "tools/create-game.mjs",
];
for (const path of [
    "Design/Tables/__tables__.xlsx",
    "Design/Tables/#TableAppConfig.xlsx",
    "Design/tools/luban.conf",
    "Design/tools/LUBAN_VERSION",
    "Design/tools/Luban/Luban.dll",
]) {
    if (!existsSync(join(projectRoot, "..", path))) {
        errors.push(`Required repository path is missing: ${path}`);
    }
}
for (const path of requiredPaths) {
    if (!existsSync(join(projectRoot, path))) {
        errors.push(`Required path is missing: ${path}`);
    }
}

if (errors.length > 0) {
    console.error("Doctor found configuration errors:");
    for (const error of errors) {
        console.error(`- ${error}`);
    }
    process.exitCode = 1;
} else {
    console.log(`Doctor OK: Node ${process.versions.node}, LayaAir ${LAYA_VERSION}, ui2, TypeScript 5.9.3.`);
    console.log(`CLI runtime: ${join(homedir(), ".layaair", LAYA_VERSION)}`);
    if (verifiedIdeRoot) {
        console.log(`IDE runtime: ${verifiedIdeRoot}`);
    }
}
