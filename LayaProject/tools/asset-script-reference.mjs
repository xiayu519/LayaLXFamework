import { dirname, resolve } from "node:path";

/** 原生 IDE 的 scriptPath 相对 assets 解析；旧资源曾使用自身目录。 */
export function resolveComponentScript(assetsRoot, hierarchyPath, scriptPath, uuid, readScriptUuid) {
    const candidates = new Set([
        resolve(assetsRoot, scriptPath),
        resolve(dirname(hierarchyPath), scriptPath),
    ]);
    let foundSource = false;
    for (const candidate of candidates) {
        const candidateUuid = readScriptUuid(candidate);
        if (candidateUuid === uuid && typeof uuid === "string") return candidate;
        foundSource ||= candidateUuid !== undefined;
    }
    if (foundSource) {
        throw new Error(`script component uuid does not match path '${scriptPath}'.`);
    }
    throw new Error(`script component path '${scriptPath}' is missing.`);
}
