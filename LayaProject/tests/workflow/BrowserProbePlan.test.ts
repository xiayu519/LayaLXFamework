import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { parseBrowserOptions, runSelectedBrowserProbes } from "../../tools/browser-probe-plan.mjs";

describe("browser verification scope", () => {
    const record = (calls: string[]) => Object.fromEntries(
        ["lifecycle", "network", "framework", "targeted"].map((name) => [name, async () => { calls.push(name); }]),
    );

    it("preserves complete coverage by default and appends legacy custom probes", async () => {
        for (const args of [[], ["--probe", "probe.mjs"]]) {
            const calls: string[] = [];
            await runSelectedBrowserProbes(parseBrowserOptions(args), record(calls));
            expect(calls).toEqual(["lifecycle", "network", "framework", ...(args.length ? ["targeted"] : [])]);
        }
    });

    it.each(["lifecycle", "network", "framework"])("runs only the selected %s probe group", async (suite) => {
        const calls: string[] = [];
        await runSelectedBrowserProbes(parseBrowserOptions(["--suite", suite]), record(calls));
        expect(calls).toEqual([suite]);
    });

    it("does not run unrelated regressions for targeted acceptance", async () => {
        const calls: string[] = [];
        const result = await runSelectedBrowserProbes(
            parseBrowserOptions(["--probe", "probe.mjs", "--suite", "targeted"]), record(calls),
        );
        expect(calls).toEqual(["targeted"]);
        expect(result).toEqual(calls);
    });

    it.each([
        ["--suite", "targeted"], ["--suite", "typo"], ["--suite", "toString"], ["--probe"],
        ["--suite", "network", "--suite", "all"], ["--skip-build"], ["--probe", "--suite"],
    ])("rejects invalid options before expensive work: %j", (...args) => {
        expect(() => parseBrowserOptions(args)).toThrow();
    });

    it("rejects invalid headless options before attempting a build", () => {
        expect(() => execFileSync(process.execPath, ["tools/test-headless.mjs", "--suite", "typo"], {
            encoding: "utf8", stdio: "pipe", env: { ...process.env, LAYAAIR_INSTALL_DIR: "__missing_layaair__" },
        })).toThrow(/Unknown browser suite/);
    });

    it("parses an exact viewport without changing probe selection", async () => {
        const options = parseBrowserOptions(["--viewport", "390x844", "--suite", "framework"]);
        expect(options.viewport).toEqual({ width: 390, height: 844 });
        const calls: string[] = [];
        await runSelectedBrowserProbes(options, record(calls));
        expect(calls).toEqual(["framework"]);
    });

    it.each(["0x844", "390x-1", "390.5x844", "390", "390x844x2", "Infinityx844", "10000x844"])(
        "rejects invalid viewport %s before a build", (viewport) => {
            expect(() => parseBrowserOptions(["--viewport", viewport])).toThrow(/viewport/);
        },
    );

    it("propagates probe failures and stops subsequent groups", async () => {
        const calls: string[] = [];
        await expect(runSelectedBrowserProbes(parseBrowserOptions([]), {
            ...record(calls), network: async () => { throw new Error("network failure"); },
        })).rejects.toThrow("network failure");
        expect(calls).toEqual(["lifecycle"]);
        await expect(runSelectedBrowserProbes(parseBrowserOptions(["--suite", "network"]), {}))
            .rejects.toThrow("Missing browser probe");
    });
});
