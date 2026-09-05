import { spawnSync } from "node:child_process";

const MINIMUM_PYTHON = Object.freeze([3, 9]);

export function resolvePythonRuntime() {
    const configured = process.env.PYTHON_PATH?.trim();
    const candidates = configured
        ? [{ command: configured, prefix: [] }]
        : process.platform === "win32"
            ? [
                { command: "py", prefix: ["-3"] },
                { command: "python", prefix: [] },
                { command: "python3", prefix: [] },
            ]
            : [
                { command: "python3", prefix: [] },
                { command: "python", prefix: [] },
            ];

    for (const candidate of candidates) {
        const probe = spawnSync(candidate.command, [
            ...candidate.prefix,
            "-c",
            "import sys; print('.'.join(str(value) for value in sys.version_info[:3]))",
        ], {
            encoding: "utf8",
            windowsHide: true,
        });
        const version = `${probe.stdout ?? ""}`.trim();
        if (!probe.error && probe.status === 0 && isSupportedVersion(version)) {
            return Object.freeze({ ...candidate, version });
        }
    }

    throw new Error(
        `Python ${MINIMUM_PYTHON.join(".")}+ was not found. Prepare the local environment or set PYTHON_PATH.`,
    );
}

export function runPython(args, options = {}) {
    const runtime = resolvePythonRuntime();
    return spawnSync(runtime.command, [...runtime.prefix, ...args], {
        windowsHide: true,
        ...options,
    });
}

function isSupportedVersion(version) {
    const [major, minor] = version.split(".").map(Number);
    return major > MINIMUM_PYTHON[0]
        || (major === MINIMUM_PYTHON[0] && minor >= MINIMUM_PYTHON[1]);
}
