import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateContentAssetProject } from "./content-asset-policy.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { failures, counts } = validateContentAssetProject(projectRoot);

if (failures.length > 0) {
    console.error("Content asset policy validation failed:");
    for (const failure of failures) {
        console.error(`- ${failure}`);
    }
    process.exitCode = 1;
} else {
    console.log(
        `Content asset policy OK: ${counts.textures} texture(s), ${counts.atlasConfigs} atlas config(s), `
        + `${counts.audio} audio file(s), ${counts.spineGroups} Spine package(s).`,
    );
}
