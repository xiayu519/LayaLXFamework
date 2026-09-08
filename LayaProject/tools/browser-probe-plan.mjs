const suites = {
    all: ["lifecycle", "network", "framework"],
    lifecycle: ["lifecycle"],
    network: ["network"],
    framework: ["framework"],
    targeted: [],
};

export function parseBrowserOptions(args) {
    const options = { suite: "all", probe: undefined };
    const seen = new Set();
    for (let index = 0; index < args.length; index += 2) {
        const flag = args[index];
        const value = args[index + 1];
        if (!["--suite", "--probe"].includes(flag) || seen.has(flag) || !value || value.startsWith("--")) {
            throw new Error("Usage: [--suite all|lifecycle|network|framework|targeted] [--probe <trusted-local-module.mjs>]");
        }
        seen.add(flag);
        options[flag.slice(2)] = value;
    }
    if (!Object.hasOwn(suites, options.suite)) throw new Error(`Unknown browser suite: ${options.suite}`);
    if (options.suite === "targeted" && !options.probe) {
        throw new Error("The targeted suite requires --probe; startup alone is not task acceptance.");
    }
    return options;
}

/** Startup, error collection and shutdown stay outside this optional probe selection. */
export async function runSelectedBrowserProbes(options, probes) {
    const selected = suites[options.suite];
    if (!selected || (options.suite === "targeted" && !options.probe)) {
        throw new Error("Invalid browser probe selection.");
    }
    const names = [...selected, ...(options.probe ? ["targeted"] : [])];
    for (const name of names) {
        if (typeof probes[name] !== "function") throw new Error(`Missing browser probe: ${name}`);
    }
    for (const name of names) await probes[name]();
    return names;
}
