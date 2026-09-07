import type { SceneResourceRequest } from "./BaseGameScene";

export function validateResources(
    resources: readonly SceneResourceRequest[],
): readonly SceneResourceRequest[] {
    const byUrl = new Map<string, SceneResourceRequest>();
    for (const resource of resources) {
        if (!resource.url) throw new Error("Scene resource url is required.");
        const previous = byUrl.get(resource.url);
        if (previous) {
            if (previous.type !== resource.type) {
                throw new Error(`Scene resource '${resource.url}' is declared with conflicting types.`);
            }
            continue;
        }
        byUrl.set(resource.url, Object.freeze({ ...resource }));
    }
    return Object.freeze([...byUrl.values()]);
}

export function toLoadURL(resource: SceneResourceRequest): Laya.ILoadURL {
    return {
        url: resource.url,
        type: resource.type,
        priority: resource.priority,
        cache: resource.cache,
        noRetry: resource.noRetry,
    };
}

export function validateResourceResults(
    resources: readonly SceneResourceRequest[], results: unknown,
): void {
    if (!Array.isArray(results) || results.length !== resources.length) {
        throw new Error("Scene resource batch returned an invalid result.");
    }
    const failed = resources.filter((_, index) => results[index] == null).map((item) => item.url);
    if (failed.length > 0) throw new Error(`Scene resources failed to load: ${failed.join(", ")}.`);
}
