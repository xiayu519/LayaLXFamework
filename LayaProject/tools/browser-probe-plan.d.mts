export interface BrowserOptions {
    suite: "all" | "lifecycle" | "network" | "framework" | "targeted";
    probe?: string;
    viewport?: { width: number; height: number };
}
export function parseBrowserOptions(args: string[]): BrowserOptions;
export function runSelectedBrowserProbes(
    options: BrowserOptions,
    probes: Partial<Record<"lifecycle" | "network" | "framework" | "targeted", () => Promise<unknown>>>,
): Promise<string[]>;
