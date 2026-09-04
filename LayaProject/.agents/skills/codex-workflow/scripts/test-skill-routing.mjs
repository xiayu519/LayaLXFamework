import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const scriptPath = resolve(scriptDirectory, "test-skill-routing.ps1");
const shell = process.env.SystemRoot ? resolve(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe") : "powershell.exe";
const result = spawnSync(shell, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
});

if (result.error) {
    throw result.error;
}
process.exit(result.status ?? 1);
