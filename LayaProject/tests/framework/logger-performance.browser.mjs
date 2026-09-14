/** 只测量编译后日志包装代码的 CPU 耗时；计数接收器排除宿主控制台和 SDK 传输成本。 */
export default function loggerPerformanceProbe() {
    return `(() => {
        const logger = lx.logger, originalLog = console.log;
        const previousStyle = logger.style, previousEnabled = logger.enabled;
        const calls = 100000, rounds = 9, payload = { item: 7 };
        const samples = { plain: [], css: [], disabled: [] };
        let sinkCalls = 0;
        console.log = () => { sinkCalls++; };
        const run = mode => {
            logger.style = mode === "plain" ? "plain" : "css";
            logger.enabled = mode !== "disabled";
            sinkCalls = 0;
            const start = performance.now();
            for (let i = 0; i < calls; i++) logger.log("[Inventory] item %d", i, payload);
            const elapsed = performance.now() - start;
            if (sinkCalls !== (mode === "disabled" ? 0 : calls)) throw new Error("Logger sink count mismatch");
            return elapsed;
        };
        try {
            const modes = Object.keys(samples);
            for (let i = 0; i < 3; i++) for (const mode of modes) run(mode);
            for (let round = 0; round < rounds; round++) {
                for (let index = 0; index < modes.length; index++) {
                    const mode = modes[(index + round) % modes.length];
                    samples[mode].push(run(mode));
                }
            }
            const medians = Object.fromEntries(Object.entries(samples).map(([mode, values]) =>
                [mode, [...values].sort((a, b) => a - b)[Math.floor(rounds / 2)]]));
            return { passed: true, scope: "compiled wrapper CPU with counting sink; excludes console UI and SDK I/O",
                callsPerSample: calls, rounds, medianMs: medians,
                cssExtraMicrosecondsPerCall: (medians.css - medians.plain) * 1000 / calls,
                disabledSinkCalls: 0, userAgent: navigator.userAgent };
        } finally {
            console.log = originalLog;
            logger.style = previousStyle; logger.enabled = previousEnabled;
        }
    })()`;
}
