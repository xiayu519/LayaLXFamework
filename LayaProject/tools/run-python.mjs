import { runPython } from "./python-runtime.mjs";

if (process.argv.length < 3) {
    throw new Error("A Python script path is required.");
}

const result = runPython(process.argv.slice(2), { stdio: "inherit" });
if (result.error) {
    throw result.error;
}
process.exitCode = result.status ?? 1;
