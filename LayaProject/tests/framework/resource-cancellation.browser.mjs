import uiResourcesProbe from "../game/logic/ui-resources.browser.mjs";

/** 复用真实资源专项，框架走兼容取消路径，外部调用方保留独立的标准信号。 */
export default function resourceCancellationProbe() {
    return `(async () => {
        const native = { AbortController: globalThis.AbortController,
            AbortSignal: globalThis.AbortSignal, DOMException: globalThis.DOMException };
        await lx.stop();
        globalThis.AbortController = undefined;
        globalThis.AbortSignal = undefined;
        globalThis.DOMException = undefined;
        try {
            await globalThis.$_main_();
            // 专项中的外部取消请求独立于框架；只在测试词法作用域提供此构造器。
            const AbortController = native.AbortController;
            const resources = await ${uiResourcesProbe()};
            await lx.stop();
            return { passed: resources.passed, frameworkUsesFallback: true, resources };
        } finally {
            Object.assign(globalThis, native);
            await globalThis.$_main_();
        }
    })()`;
}
