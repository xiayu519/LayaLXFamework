import { spawnSync } from "node:child_process";
import { join } from "node:path";

const executable = join(
    process.cwd(),
    "node_modules",
    "typescript",
    "bin",
    "tsc",
);

for (const project of ["tsconfig.json", "tsconfig.test.json"]) {
    console.log(`[typecheck] ${project}`);
    const result = spawnSync(process.execPath, [executable, "-p", project, "--noEmit"], {
        cwd: process.cwd(),
        env: process.env,
        stdio: "inherit",
    });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}
